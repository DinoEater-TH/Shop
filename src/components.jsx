import React, { useEffect, useRef, useState } from 'react'
import { baht, currentPosition, distanceKm, loadMaps, num } from './api'

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
  const [manual, setManual] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadMaps().then(maps => {
      if (cancelled || !holder.current) return
      const center = value ? { lat: num(value.lat), lng: num(value.lng) } : { lat: num(store.StoreLat) || 13.7563, lng: num(store.StoreLng) || 100.5018 }
      map.current = new maps.Map(holder.current, { center, zoom: value ? 16 : 13 })
      marker.current = new maps.Marker({ map: map.current, position: center, draggable: true })
      maps.event.addListener(marker.current, 'dragend', event => onChange({ lat: event.latLng.lat(), lng: event.latLng.lng() }))
      maps.event.addListener(map.current, 'click', event => { marker.current.setPosition(event.latLng); onChange({ lat: event.latLng.lat(), lng: event.latLng.lng() }) })
      if (num(store.StoreLat) && num(store.StoreLng)) new maps.Marker({ map: map.current, position: { lat: num(store.StoreLat), lng: num(store.StoreLng) }, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png' } })
    }).catch(() => setManual(true))
    return () => { cancelled = true }
  }, [])

  async function useCurrentLocation() {
    try {
      const point = await currentPosition()
      onChange(point)
      if (map.current && marker.current) { marker.current.setPosition(point); map.current.setCenter(point); map.current.setZoom(16) }
      setError('')
    } catch (locationError) { setError(locationError.message) }
  }

  return <div className="map-picker">
    {!manual && <div className="map-canvas" ref={holder} />}
    <div className="map-actions">
      <button type="button" onClick={useCurrentLocation}>📍 ใช้ตำแหน่งปัจจุบัน</button>
      {manual && <label className="manual-coords">พิกัด<input value={value ? `${num(value.lat).toFixed(4)}, ${num(value.lng).toFixed(4)}` : ''} readOnly placeholder="กดใช้ตำแหน่งปัจจุบัน" /></label>}
    </div>
    {value && <p className="hint">ระยะทางจากร้าน {distanceKm(store, value)} กม.</p>}
    {error && <p className="hint error">{error}</p>}
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
