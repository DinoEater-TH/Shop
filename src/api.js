const API_URL = import.meta.env.VITE_API_URL || ''
export const SITE_URL = import.meta.env.BASE_URL || '/'

export async function api(action, data = {}) {
  if (!API_URL) throw new Error('ยังไม่ได้ตั้งค่า VITE_API_URL')
  const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...data }) })
  const json = await response.json()
  if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด')
  return json.data
}

export const num = value => { const result = Number(value); return Number.isFinite(result) ? result : 0 }
export const baht = value => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(num(value))
export const promoOf = (promotions, type) => (promotions || []).find(item => String(item.PromoType) === type && String(item.IsActive).toUpperCase() !== 'FALSE')
export const isAdmin = user => !!user && ['Admin', 'SuperAdmin'].includes(user.Role)
export const fmtTime = value => value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'

export function orderOptions(order) {
  try {
    const raw = order?.Options
    if (!raw) return []
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed.filter(group => (group.choices || []).length) : []
  } catch { return [] }
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
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      image.onerror = () => reject(new Error('อ่านรูปไม่สำเร็จ'))
      image.src = reader.result
    }
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })
}
