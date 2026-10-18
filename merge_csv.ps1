Add-Type -AssemblyName Microsoft.VisualBasic

$srcDir = 'D:\ชำนาญการ เรื่องที่ 1'
$outFile = Join-Path $srcDir 'merged_posts_all.csv'

function Read-CsvFile([string]$path) {
    $parser = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($path, [System.Text.Encoding]::UTF8, $true)
    $parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
    $parser.SetDelimiters(',')
    $parser.HasFieldsEnclosedInQuotes = $true
    try {
        if ($parser.EndOfData) { return $null }
        $header = $parser.ReadFields()
        $rows = New-Object System.Collections.Generic.List[string[]]
        while (-not $parser.EndOfData) {
            $f = $parser.ReadFields()
            if ($null -ne $f) { $rows.Add($f) }
        }
        return [pscustomobject]@{ Header = $header; Rows = $rows }
    } finally {
        $parser.Close()
    }
}

function Escape-Csv([string]$s) {
    if ($null -eq $s) { return '' }
    if ($s -match '[",\r\n]') {
        return '"' + ($s -replace '"', '""') + '"'
    }
    return $s
}

$files = Get-ChildItem -Path $srcDir -Filter '*.csv' -File |
    Where-Object { $_.FullName -ne $outFile } |
    Sort-Object Name

$allColumns = New-Object System.Collections.Generic.List[string]
$colSet = New-Object 'System.Collections.Generic.HashSet[string]'
$rowsOut = New-Object System.Collections.Generic.List[object]
$seenIds = New-Object 'System.Collections.Generic.HashSet[string]'
$dupCount = 0
$fileSummaries = @()

foreach ($file in $files) {
    $data = Read-CsvFile $file.FullName
    if ($null -eq $data) { continue }

    foreach ($c in $data.Header) {
        if (-not $colSet.Contains($c)) {
            $colSet.Add($c) | Out-Null
            $allColumns.Add($c)
        }
    }

    $idIdx = [Array]::IndexOf($data.Header, 'ID โพสต์')
    $count = 0
    foreach ($row in $data.Rows) {
        $id = ''
        if ($idIdx -ge 0 -and $idIdx -lt $row.Count) { $id = $row[$idIdx] }
        if ($id -ne '' -and -not $seenIds.Add($id)) {
            $dupCount++
            continue
        }
        $obj = [ordered]@{}
        for ($i = 0; $i -lt $data.Header.Count; $i++) {
            $val = if ($i -lt $row.Count) { $row[$i] } else { '' }
            $obj[$data.Header[$i]] = $val
        }
        $rowsOut.Add([pscustomobject]$obj)
        $count++
    }
    $fileSummaries += [pscustomobject]@{ File = $file.Name; Rows = $count }
}

# Sort by เวลาที่เผยแพร่ (MM/dd/yyyy HH:mm) ascending — past to present
$fmt = 'MM/dd/yyyy HH:mm'
$cult = [System.Globalization.CultureInfo]::InvariantCulture
foreach ($r in $rowsOut) {
    $dt = [datetime]::MinValue
    $raw = [string]$r.'เวลาที่เผยแพร่'
    if (-not [datetime]::TryParseExact($raw, $fmt, $cult, [System.Globalization.DateTimeStyles]::None, [ref]$dt)) {
        $dt = [datetime]::MaxValue
    }
    $r | Add-Member -NotePropertyName '_SortKey' -NotePropertyValue $dt -Force
}
$sorted = $rowsOut | Sort-Object -Property _SortKey

# Ensure ID โพสต์ is first column
$ordered = New-Object System.Collections.Generic.List[string]
if ($colSet.Contains('ID โพสต์')) { $ordered.Add('ID โพสต์') }
foreach ($c in $allColumns) { if ($c -ne 'ID โพสต์') { $ordered.Add($c) } }

$sw = New-Object System.IO.StreamWriter($outFile, $false, (New-Object System.Text.UTF8Encoding($true)))
try {
    $sw.WriteLine(($ordered | ForEach-Object { Escape-Csv $_ }) -join ',')
    foreach ($row in $sorted) {
        $line = New-Object System.Collections.Generic.List[string]
        foreach ($c in $ordered) {
            $line.Add((Escape-Csv ([string]$row.$c)))
        }
        $sw.WriteLine(($line -join ','))
    }
} finally {
    $sw.Close()
}

Write-Host "Files merged: $($files.Count)"
Write-Host "Total rows written: $($rowsOut.Count)"
Write-Host "Duplicates skipped (same ID โพสต์): $dupCount"
Write-Host "Output: $outFile"
Write-Host "`nRows per file:"
$fileSummaries | Format-Table -AutoSize
