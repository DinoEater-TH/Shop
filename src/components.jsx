import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api, baht, currentPosition, distanceKm, num, storeCoords, storeDirectionsUrl } from './api'

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
  return <div className="lightbox" onClick={onClose}>
    <button className="lightbox-close" onClick={onClose} aria-label="ปิด">×</button>
    <img className="lightbox-image" src={src} alt={title || ''} onClick={onClose} />
    {title && <p className="lightbox-title">{title}</p>}
  </div>
}

export function StatusBadge({ status }) {
  const labels = { Pending: 'รอรับออเดอร์', Accepted: 'กำลังทำ', Ready: 'พร้อมรับ/ส่ง', OutForDelivery: 'กำลังจัดส่ง', Completed: 'เสร็จสิ้น', Cancelled: 'ยกเลิก' }
  return <span className={`badge badge-${String(status).toLowerCase()}`}>{labels[status] || status}</span>
}

export function QueueTimer({ minutes }) {
  const [left, setLeft] = useState(Math.max(0, Math.round(num(minutes) * 60)))
  useEffect(() => { setLeft(Math.max(0, Math.round(num(minutes) * 60))) }, [minutes])
  useEffect(() => {
    const timer = setInterval(() => setLeft(value => (value > 0 ? value - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [])
  const mm = Math.floor(left / 60), ss = left % 60
  return <b className="queue-timer">{mm}:{String(ss).padStart(2, '0')}</b>
}

export function WelcomeModal({ onMember, onGuest, onAdmin }) {
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [point, setPoint] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const digits = String(phone).replace(/\D/g, '')

  async function check() {
    setError('')
    if (!/^0\d{8,9}$/.test(digits)) return setError('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง')
    setBusy(true)
    try {
      const data = await api('login', { phone: digits })
      if (!data.exists) { setStep('ask'); return }
      if (data.requiresPin) { onAdmin({ phone: digits, mode: 'pin', name: data.Name }); return }
      if (data.needsPinSetup) { onAdmin({ phone: digits, mode: 'setup', name: data.Name }); return }
      onMember(data)
    } catch (checkError) { setError(checkError.message) } finally { setBusy(false) }
  }
  async function register() {
    setError('')
    if (!/^0\d{8,9}$/.test(digits)) return setError('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง')
    setBusy(true)
    try {
      const data = await api('login', { phone: digits, register: true, name, address, lat: point?.lat || '', lng: point?.lng || '' })
      onMember(data)
    } catch (registerError) { setError(registerError.message) } finally { setBusy(false) }
  }
  async function pin() {
    setError('')
    try { setPoint(await currentPosition()) } catch (pinError) { setError(pinError.message) }
  }

  return <div className="modal welcome">
    <div className="modal-card">
      {step === 'phone' && <>
        <h2>ยินดีต้อนรับสู่ DinoEater</h2>
        <p className="hint">กรอกเบอร์โทรเพื่อเข้าใช้งานหรือสะสมแสตมป์ (หรือกดข้ามได้)</p>
        <Field label="เบอร์โทรศัพท์"><input value={phone} inputMode="tel" onChange={event => setPhone(event.target.value)} placeholder="08x-xxx-xxxx" /></Field>
        {error && <p className="hint error">{error}</p>}
        <button className="primary" disabled={busy} onClick={check}>{busy ? 'กำลังตรวจสอบ...' : 'ตรวจสอบเบอร์'}</button>
        <button className="ghost" onClick={onGuest}>ข้าม · เป็นลูกค้าทั่วไป</button>
      </>}
      {step === 'ask' && <>
        <h2>ยังไม่เป็นสมาชิก</h2>
        <p className="hint">เบอร์ {digits} ยังไม่มีบัญชี ต้องการสมัครสมาชิกหรือไม่?</p>
        <button className="primary" onClick={() => setStep('register')}>ตกลง · สมัครสมาชิก</button>
        <button className="ghost" onClick={onGuest}>ไม่ · เป็นลูกค้าทั่วไป</button>
      </>}
      {step === 'register' && <>
        <h2>สมัครสมาชิก</h2>
        <Field label="เบอร์โทรศัพท์ (จำเป็น)"><input value={phone} inputMode="tel" onChange={event => setPhone(event.target.value)} placeholder="08x-xxx-xxxx" /></Field>
        <Field label="ชื่อ (ใส่ทีหลังได้)"><input value={name} onChange={event => setName(event.target.value)} placeholder="ชื่อจริงหรือชื่อเล่น" /></Field>
        <Field label="ที่อยู่ (ใส่ทีหลังได้)"><input value={address} onChange={event => setAddress(event.target.value)} placeholder="บ้านเลขที่ / จุดสังเกต" /></Field>
        <div className="map-actions">
          <button type="button" onClick={pin}>📍 หมุดของฉัน (บันทึกพิกัดบ้าน)</button>
        </div>
        {point && <p className="hint">บันทึกพิกัดแล้ว: {num(point.lat).toFixed(4)}, {num(point.lng).toFixed(4)}</p>}
        {error && <p className="hint error">{error}</p>}
        <button className="primary" disabled={busy} onClick={register}>{busy ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}</button>
        <button className="ghost" onClick={onGuest}>ข้าม · เป็นลูกค้าทั่วไป</button>
      </>}
    </div>
  </div>
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
