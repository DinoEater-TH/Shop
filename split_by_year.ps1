Add-Type -AssemblyName Microsoft.VisualBasic

$srcFile = 'D:\ชำนาญการ เรื่องที่ 1\merged_posts_all.csv'
$outDir = 'D:\ชำนาญการ เรื่องที่ 1'

$parser = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($srcFile, [System.Text.Encoding]::UTF8, $true)
$parser.TextFieldType = [Microsoft.VisualBasic.FileIO.FieldType]::Delimited
$parser.SetDelimiters(',')
$parser.HasFieldsEnclosedInQuotes = $true

function Escape-Csv([string]$s) {
    if ($null -eq $s) { return '' }
    if ($s -match '[",\r\n]') { return '"' + ($s -replace '"', '""') + '"' }
    return $s
}

$byYear = @{}
try {
    $header = $parser.ReadFields()
    $timeIdx = [Array]::IndexOf($header, 'เวลาที่เผยแพร่')
    $headerLine = ($header | ForEach-Object { Escape-Csv $_ }) -join ','

    while (-not $parser.EndOfData) {
        $fields = $parser.ReadFields()
        if ($null -eq $fields) { continue }
        $raw = if ($timeIdx -ge 0 -and $timeIdx -lt $fields.Count) { [string]$fields[$timeIdx] } else { '' }
        $year = 'unknown'
        if ($raw -match '(\d{4})') { $year = $Matches[1] }
        if (-not $byYear.ContainsKey($year)) { $byYear[$year] = New-Object System.Collections.Generic.List[string[]] }
        $byYear[$year].Add($fields)
    }
} finally {
    $parser.Close()
}

foreach ($year in ($byYear.Keys | Sort-Object)) {
    $outPath = Join-Path $outDir "merged_posts_$year.csv"
    $sw = New-Object System.IO.StreamWriter($outPath, $false, (New-Object System.Text.UTF8Encoding($true)))
    try {
        $sw.WriteLine($headerLine)
        foreach ($fields in $byYear[$year]) {
            $line = New-Object System.Collections.Generic.List[string]
            for ($i = 0; $i -lt $header.Count; $i++) {
                $val = if ($i -lt $fields.Count) { $fields[$i] } else { '' }
                $line.Add((Escape-Csv $val))
            }
            $sw.WriteLine(($line -join ','))
        }
    } finally {
        $sw.Close()
    }
    Write-Host ("{0}: {1} rows -> {2}" -f $year, $byYear[$year].Count, $outPath)
}
