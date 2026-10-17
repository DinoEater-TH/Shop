import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { baht, currentPosition, distanceKm, num, storeCoords, storeDirectionsUrl } from './api'

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 }

function pinIcon() {
  return L.divIcon({ className: 'map-pin', html: '<span>📍</span>', iconSize: [30, 30], iconAnchor: [15, 28], popupAnchor: [0, -26] })
}

function addTiles(map) {
  L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map)
}

export function Empty({ text, action, onAction }) {
  return <div className="empty"><div className="empty-icon">🍢</div><p>{text}</p>{action && <button className="primary" onClick={onAction}>{action}</button>}</div>
}

export function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="hint">{hint}</small>}</label>
}

export function Lightbox({ src, title, onClose }) {
  if (!src) return null
  return <div className="lightbox" onClick={onClose}><div className="lightbox-inner"><img src={src} alt={title || ''} /><p>{title}</p></div></div>
}

export function StatusBadge({ status }) {
  const labels = { Pending: 'รอรับออเดอร์', Accepted: 'กำลังทำ', Ready: 'พร้อมรับ/พร้อมส่ง', Completed: 'เสร็จสิ้น', Cancelled: 'ยกเลิก' }
  return <span className={`badge badge-${String(status).toLowerCase()}`}>{labels[status] || status}</span>
}

export function Receipt({ subtotal, deliveryFee, discount, total, lines = [] }) {
  return <div className="receipt">
    <div><span>ค่าอาหาร</span><b>{baht(subtotal)}</b></div>
    {deliveryFee > 0 && <div><span>ค่าจัดส่ง</span><b>{baht(deliveryFee)}</b></div>}
    {lines.map(line => <div className="discount-line" key={line.label}><span>{line.label}</span><b>-{baht(line.value)}</b></div>)}
    {discount > 0 && !lines.length && <div className="discount-line"><span>ส่วนลด</span><b>-{baht(discount)}</b></div>}
    <div className="grand"><span>ยอดสุทธิ</span><b>{baht(total)}</b></div>
  </div>
}

export function MapPicker({ store, value, onChange }) {
  const holder = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const [error, setError] = useState('')
  const start = value && value.lat ? { lat: num(value.lat), lng: num(value.lng) } : storeCoords(store)
  const startLat = start?.lat, startLng = start?.lng

  function place(point, recenter) {
    onChange(point)
    if (!map.current) return
    const latlng = [point.lat, point.lng]
    if (marker.current) marker.current.setLatLng(latlng)
    else marker.current = L.marker(latlng, { icon: pinIcon(), draggable: true }).addTo(map.current).on('dragend', event => onChange(latlngOf(event.target)))
    if (recenter) map.current.setView(latlng, 16)
  }

  useEffect(() => {
    if (!holder.current) return
    const center = startLat && startLng ? { lat: startLat, lng: startLng } : DEFAULT_CENTER
    const instance = L.map(holder.current).setView([center.lat, center.lng], startLat ? 16 : 12)
    addTiles(instance)
    if (startLat && startLng) marker.current = L.marker([startLat, startLng], { icon: pinIcon(), draggable: true }).addTo(instance).on('dragend', event => onChange(latlngOf(event.target)))
    instance.on('click', event => place({ lat: event.latlng.lat, lng: event.latlng.lng }, false))
    map.current = instance
    return () => { instance.remove(); map.current = null; marker.current = null }
  }, [])

  async function useCurrentLocation() {
    try {
      const point = await currentPosition()
      place(point, true)
      setError('')
    } catch (locationError) { setError(locationError.message) }
  }

  return <div className="map-picker">
    <div className="map-canvas" ref={holder} />
    <div className="map-actions">
      <button type="button" onClick={useCurrentLocation}>📍 ใช้ตำแหน่งปัจจุบัน</button>
      <label className="manual-coords">พิกัด
        <input value={value?.lat ? `${num(value.lat).toFixed(5)}, ${num(value.lng).toFixed(5)}` : ''} readOnly placeholder="แตะบนแผนที่หรือใช้ตำแหน่งปัจจุบัน" />
      </label>
    </div>
    <p className="hint">แตะบนแผนที่หรือลากหมุดเพื่อปักตำแหน่งร้าน</p>
    {value && value.lat ? <p className="hint">ระยะทางจากร้านถึงจุดนี้ {distanceKm(store, value)} กม.</p> : null}
    {error && <p className="hint error">{error}</p>}
  </div>
}

function latlngOf(marker) { const point = marker.getLatLng(); return { lat: point.lat, lng: point.lng } }

export function StoreMap({ settings, height = 260 }) {
  const holder = useRef(null)
  const coords = storeCoords(settings)
  const directions = storeDirectionsUrl(settings)
  const lat = coords?.lat, lng = coords?.lng

  useEffect(() => {
    if (!lat || !lng || !holder.current) return
    const instance = L.map(holder.current, { scrollWheelZoom: false }).setView([lat, lng], 16)
    addTiles(instance)
    L.marker([lat, lng], { icon: pinIcon() }).addTo(instance).bindPopup(settings.StoreName || 'ร้าน')
    setTimeout(() => instance.invalidateSize(), 0)
    return () => instance.remove()
  }, [lat, lng])

  if (!coords && !settings.StoreAddress) return null
  return <div className="store-map">
    {coords
      ? <div className="map-canvas" style={{ height }} ref={holder} />
      : <div className="map-fallback" style={{ minHeight: height }}>
        <span>📍</span>
        <b>{settings.StoreName || 'ร้าน'}</b>
        {settings.StoreAddress && <small>{settings.StoreAddress}</small>}
        <small className="hint">ร้านยังไม่ปักหมุดตำแหน่งบนแผนที่</small>
      </div>}
    {directions && <button className="primary" onClick={() => window.open(directions, '_blank')}>🧭 นำทางไปร้าน</button>}
  </div>
}

export function ChatRoom({ chat, send, phone, sessionToken, onResolve, canResolve }) {
  const [message, setMessage] = useState('')
  if (!chat) return <Empty text="ยังไม่มีห้องสนทนา" />
  return <div className="chat">
    <div className="chat-scroll">
      {chat.messages.map(item => <div key={item.ChatID} className={`bubble ${item.SenderRole === 'Admin' ? 'from-admin' : 'from-customer'}`}>
        <small>{item.SenderRole === 'Admin' ? 'ร้าน' : 'ลูกค้า'} · {new Date(item.Timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</small>
        <p>{item.Message}</p>
      </div>)}
      {!chat.messages.length && <p className="hint">พิมพ์ข้อความเพื่อเริ่มสนทนา</p>}
    </div>
    <div className="chat-input">
      <input value={message} onChange={event => setMessage(event.target.value)} placeholder="พิมพ์ข้อความ..." />
      <button onClick={() => { if (!message.trim()) return; send(message); setMessage('') }}>ส่ง</button>
    </div>
    {canResolve && chat.status === 'Open' && <button className="primary" onClick={onResolve}>ดำเนินการแก้ไขแล้ว (ปิดเคส)</button>}
  </div>
}
