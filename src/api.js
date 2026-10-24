const API_URL = import.meta.env.VITE_API_URL || ''
export const SITE_URL = import.meta.env.BASE_URL || '/'

let inflight = 0
let lastApiAt = 0
const touchActivity = () => { lastApiAt = Date.now() }

export async function api(action, data = {}, background = false) {
  if (!API_URL) throw new Error('ยังไม่ได้ตั้งค่า VITE_API_URL')
  if (!background) { touchActivity(); inflight += 1 }
  try {
    const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...data }) })
    const json = await response.json()
    if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด')
    return json.data
  } finally {
    if (!background) { inflight = Math.max(0, inflight - 1); touchActivity() }
  }
}

export function installBusyFeedback() {
  if (typeof document === 'undefined') return () => {}
  let active = null
  let timer = 0

  const release = () => {
    clearTimeout(timer)
    timer = 0
    if (!active) return
    active.removeAttribute('data-busy')
    active.classList.remove('btn-busy')
    active = null
  }

  const idle = () => inflight === 0 && Date.now() - lastApiAt >= 200

  const onPress = event => {
    const button = event.target && event.target.closest ? event.target.closest('button') : null
    if (!button) return
    if (button.hasAttribute('data-busy')) { event.stopPropagation(); event.preventDefault(); return }
    release()
    active = button
    button.setAttribute('data-busy', '1')
    button.classList.add('btn-busy')
    const started = Date.now()
    const tick = () => {
      if (Date.now() - started >= 200 && idle()) { release(); return }
      timer = setTimeout(tick, 60)
    }
    timer = setTimeout(tick, 60)
  }

  document.addEventListener('click', onPress, true)
  return () => { document.removeEventListener('click', onPress, true); release() }
}

export const num = value => { const result = Number(value); return Number.isFinite(result) ? result : 0 }
export const baht = value => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(num(value))
export const promoOf = (promotions, type) => (promotions || []).find(item => String(item.PromoType) === type && String(item.IsActive).toUpperCase() !== 'FALSE')
export const isAdmin = user => !!user && ['Admin', 'SuperAdmin'].includes(user.Role)
export const isNewItem = item => {
  const at = item?.NewAt
  if (!at) return false
  const time = new Date(at).getTime()
  return Number.isFinite(time) && Date.now() - time < 30 * 24 * 60 * 60 * 1000
}
export const fmtTime = value => value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'

const CACHE_PFX = 'dino-cache:'
export function readCache(key) { try { const raw = localStorage.getItem(CACHE_PFX + key); if (!raw) return null; return JSON.parse(raw) } catch { return null } }
export function writeCache(key, data) { try { localStorage.setItem(CACHE_PFX + key, data != null ? JSON.stringify(data) : '') } catch { /* quota */ } }
export function clearCache(key) { try { localStorage.removeItem(CACHE_PFX + key) } catch { /* ignore */ } }

export function orderOptions(order) {
  try {
    const raw = order?.Options
    if (!raw) return []
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed.filter(group => (group.choices || []).length) : []
  } catch { return [] }
}

export function driveImage(url, width) {
  if (!url) return url
  if (url.indexOf('drive.google.com') < 0) return url
  if (/[?&]sz=w\d+/.test(url)) return url.replace(/sz=w\d+/, `sz=w${width}`)
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + `sz=w${width}`
}

export function distanceKm(store, point) {
  if (!store || store.StoreLat === '' || store.StoreLat === undefined || !point) return 0
  const lat1 = num(store.StoreLat), lng1 = num(store.StoreLng), lat2 = num(point.lat), lng2 = num(point.lng)
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(a)) * 10) / 10
}

export function deliveryFeeFor(settings, subtotal, distance) {
  if (subtotal >= num(settings.FreeDeliveryMinimum) && num(settings.FreeDeliveryMinimum) > 0) return 0
  const free = num(settings.FreeDeliveryDistanceKm)
  const chargeKm = Math.max(0, Math.ceil(distance - free))
  return chargeKm * num(settings.DeliveryFeePerKm)
}

export function storeCoords(settings) {
  const lat = num(settings?.StoreLat), lng = num(settings?.StoreLng)
  return lat && lng ? { lat, lng } : null
}

export function storeDirectionsUrl(settings) {
  const coords = storeCoords(settings)
  if (coords) return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`
  const query = settings?.StoreAddress || settings?.StoreName || ''
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : ''
}

export function storeMapUrl(settings) {
  const coords = storeCoords(settings)
  if (coords) return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
  const query = settings?.StoreAddress || settings?.StoreName || ''
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : ''
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('อุปกรณ์ไม่รองรับการระบุตำแหน่ง'))
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => reject(new Error('ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง')),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  })
}

export function beep(times = 3) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const context = new AudioContextClass()
    for (let i = 0; i < times; i++) {
      const oscillator = context.createOscillator(), gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = i % 2 ? 660 : 880
      gain.gain.value = 0.12
      oscillator.connect(gain).connect(context.destination)
      const start = context.currentTime + i * 0.28
      oscillator.start(start)
      oscillator.stop(start + 0.22)
    }
  } catch { /* audio not available */ }
}

export function compressImage(file, maxSize = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('')
    touchActivity()
    const heartbeat = setInterval(touchActivity, 120)
    const finish = (fn, value) => { clearInterval(heartbeat); fn(value) }
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const width = Math.min(maxSize, image.width)
        const height = Math.round(image.height * width / image.width)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(image, 0, 0, width, height)
        finish(resolve, canvas.toDataURL('image/webp', quality))
      }
      image.onerror = () => finish(reject, new Error('อ่านรูปไม่สำเร็จ'))
      image.src = reader.result
    }
    reader.onerror = () => finish(reject, new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })
}
