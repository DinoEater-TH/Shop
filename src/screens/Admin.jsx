import React, { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { api, baht, beep, compressImage, fmtTime, num } from '../api'
import { ChatRoom, Empty, Field, MapPicker, StatusBadge } from '../components'

const TABS = [
  { key: 'orders', label: 'ออเดอร์' },
  { key: 'menu', label: 'เมนู' },
  { key: 'promos', label: 'โปรโมชัน' },
  { key: 'users', label: 'สมาชิก' },
  { key: 'settings', label: 'ตั้งค่า' },
  { key: 'logs', label: 'Log' },
  { key: 'qr', label: 'QR' }
]

export default function AdminScreen({ store, reloadStore, user, requireLogin }) {
  const [tab, setTab] = useState('orders')
  const token = user?.SessionToken

  if (!user || !['Admin', 'SuperAdmin'].includes(user.Role)) return <section className="page">
    <h1>สำหรับผู้ดูแลร้าน</h1>
    <p className="hint">กรุณาเข้าสู่ระบบด้วยบัญชีที่มีบทบาท Admin หรือ SuperAdmin</p>
    <button className="primary" onClick={requireLogin}>ไปหน้าเข้าสู่ระบบ</button>
  </section>

  return <section className="page admin">
    <h1>หน้าร้าน</h1>
    <div className="tabs">{TABS.map(item => <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    {tab === 'orders' && <AdminOrders token={token} />}
    {tab === 'menu' && <AdminMenu token={token} reloadStore={reloadStore} />}
    {tab === 'promos' && <AdminPromos store={store} token={token} reloadStore={reloadStore} />}
    {tab === 'users' && <AdminUsers token={token} role={user.Role} />}
    {tab === 'settings' && <AdminSettings store={store} token={token} reloadStore={reloadStore} />}
    {tab === 'logs' && <AdminLogs token={token} role={user.Role} />}
    {tab === 'qr' && <AdminQr />}
  </section>
}

function usePolling(loader, active, interval = 10000) {
  const [data, setData] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!active) return
    let alive = true
    async function run() { try { const result = await loader(); if (alive) { setData(result); setError('') } } catch (pollError) { if (alive) setError(pollError.message) } }
    run()
    const timer = setInterval(run, interval)
    return () => { alive = false; clearInterval(timer) }
  }, [active, interval])
  return { data, error, setData }
}

function AdminOrders({ token }) {
  const { data: orders, error } = usePolling(() => api('getOrders', { sessionToken: token }), !!token, 10000)
  const seen = useRef(null)
  const [detail, setDetail] = useState(null)
  const [chatOrder, setChatOrder] = useState(null)
  const [chat, setChat] = useState(null)
  const [soundOn, setSoundOn] = useState(true)

  useEffect(() => {
    const pending = orders.filter(order => order.Status === 'Pending').map(order => order.OrderID)
    if (seen.current === null) { seen.current = new Set(pending); return }
    const fresh = pending.filter(id => !seen.current.has(id))
    fresh.forEach(id => seen.current.add(id))
    if (fresh.length && soundOn) beep(fresh.length > 1 ? 5 : 3)
  }, [orders, soundOn])

  useEffect(() => {
    if (!chatOrder) return
    let alive = true
    const load = async () => { try { const result = await api('getChat', { orderId: chatOrder.OrderID, sessionToken: token }); if (alive) setChat(result) } catch { /* no chat yet */ } }
    load()
    const timer = setInterval(load, 6000)
    return () => { alive = false; clearInterval(timer) }
  }, [chatOrder, token])

  async function advance(order, status, estimatedTime) {
    try { const updated = await api('updateOrderStatus', { sessionToken: token, orderId: order.OrderID, status, estimatedTime }); setDetail(updated) } catch (updateError) { alert(updateError.message) }
  }
  async function openDetail(order) {
    try { setDetail(await api('getOrder', { orderId: order.OrderID })) } catch (detailError) { alert(detailError.message) }
  }
  async function send(message) {
    try { setChat(await api('sendChat', { orderId: chatOrder.OrderID, sessionToken: token, message })) } catch (sendError) { alert(sendError.message) }
  }
  async function resolve() {
    try { await api('resolveDispute', { sessionToken: token, orderId: chatOrder.OrderID }); setChat(await api('getChat', { orderId: chatOrder.OrderID, sessionToken: token })) } catch (resolveError) { alert(resolveError.message) }
  }

  if (detail) return <AdminOrderDetail order={detail} onClose={() => setDetail(null)} onAdvance={advance} onChat={order => { setChatOrder(order); setDetail(null) }} />

  return <div>
    <div className="row-between"><h2>ออเดอร์ล่าสุด</h2><label className="checkline"><input type="checkbox" checked={soundOn} onChange={event => setSoundOn(event.target.checked)} /><span>เสียงเตือน</span></label></div>
    {error && <p className="hint error">{error}</p>}
    {orders.map(order => <article className="order-card" key={order.OrderID}>
      <b>{order.OrderID}</b>
      <span>{order.OrderType === 'Delivery' ? 'จัดส่ง' : 'รับเอง'} · {order.PaymentMethod === 'Transfer' ? 'โอน' : 'เงินสด'} · {baht(order.Total)}</span>
      <small>{order.Phone} · {fmtTime(order.CreatedAt)}</small>
      <div className="row-actions">
        <StatusBadge status={order.Status} />
        <button onClick={() => openDetail(order)}>รายละเอียด</button>
        {order.Status === 'Pending' && <button onClick={() => advance(order, 'Accepted')}>รับออเดอร์</button>}
        {order.Status === 'Accepted' && <button onClick={() => advance(order, 'Ready')}>อาหารพร้อม</button>}
        {order.Status === 'Ready' && <button onClick={() => advance(order, 'Completed')}>เสร็จสิ้น</button>}
      </div>
    </article>)}
    {!orders.length && !error && <p className="hint">ยังไม่มีออเดอร์</p>}
    {chatOrder && <div className="modal">
      <div className="modal-card">
        <div className="row-between"><b>แชทออเดอร์ {chatOrder.OrderID}</b><button className="ghost" onClick={() => { setChatOrder(null); setChat(null) }}>ปิด</button></div>
        <ChatRoom chat={chat} send={send} onResolve={resolve} canResolve />
      </div>
    </div>}
  </div>
}

function AdminOrderDetail({ order, onClose, onAdvance, onChat }) {
  const [minutes, setMinutes] = useState(num(order.EstimatedTime))
  return <div>
    <button className="ghost" onClick={onClose}>← กลับ</button>
    <h2>ออเดอร์ {order.OrderID}</h2>
    <StatusBadge status={order.Status} />
    <div className="receipt">
      <div><span>ลูกค้า</span><b>{order.Phone}</b></div>
      <div><span>รูปแบบ</span><b>{order.OrderType === 'Delivery' ? 'จัดส่ง' : 'รับเอง'}</b></div>
      {order.AddressDetail && <div><span>ที่อยู่</span><b>{order.AddressDetail}</b></div>}
      {num(order.Distance) > 0 && <div><span>ระยะทาง</span><b>{num(order.Distance)} กม.</b></div>}
      {(order.items || []).map(item => <div key={item.ID}><span>{item.MenuID} × {item.Quantity}</span><b>{baht(num(item.Price) * num(item.Quantity))}</b></div>)}
      <div><span>ค่าอาหาร</span><b>{baht(order.SubTotal)}</b></div>
      {num(order.DeliveryFee) > 0 && <div><span>ค่าจัดส่ง</span><b>{baht(order.DeliveryFee)}</b></div>}
      {num(order.Discount) > 0 && <div className="discount-line"><span>ส่วนลด</span><b>-{baht(order.Discount)}</b></div>}
      <div className="grand"><span>ยอดสุทธิ</span><b>{baht(order.Total)}</b></div>
    </div>
    {order.SlipURL && <p className="hint"><a href={order.SlipURL} target="_blank" rel="noreferrer">ดูสลิปโอนเงิน</a></p>}
    <Field label="เวลาทำอาหาร (นาที)"><input type="number" min="1" value={minutes} onChange={event => setMinutes(event.target.value)} /></Field>
    <div className="row-actions">
      {order.Status === 'Pending' && <button className="primary" onClick={() => onAdvance(order, 'Accepted', minutes)}>รับออเดอร์</button>}
      {order.Status === 'Accepted' && <button className="primary" onClick={() => onAdvance(order, 'Ready', minutes)}>อาหารพร้อม</button>}
      {order.Status === 'Ready' && <button className="primary" onClick={() => onAdvance(order, 'Completed', minutes)}>เสร็จสิ้น</button>}
      <button className="secondary" onClick={() => onChat(order)}>แชทลูกค้า</button>
    </div>
  </div>
}

function AdminMenu({ token, reloadStore }) {
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => { try { setItems(await api('getMenu', { sessionToken: token })); setError('') } catch (loadError) { setError(loadError.message) } }
  useEffect(() => { load() }, [token])

  async function save() {
    setBusy(true)
    try {
      await api('saveMenu', { sessionToken: token, menu: draft })
      setDraft(null)
      await load()
      await reloadStore()
    } catch (saveError) { setError(saveError.message) } finally { setBusy(false) }
  }
  async function remove(id) {
    if (!confirm('ปิดการขายเมนูนี้?')) return
    try { await api('deleteMenu', { sessionToken: token, menuId: id }); await load(); await reloadStore() } catch (removeError) { setError(removeError.message) }
  }

  return <div>
    <div className="row-between"><h2>จัดการเมนู</h2><button className="primary compact" onClick={() => setDraft({ Name: '', Description: '', Price: 0, Stock: 'Unlimited', IsActive: 'TRUE' })}>+ เพิ่มเมนู</button></div>
    {error && <p className="hint error">{error}</p>}
    {draft && <div className="card">
      <Field label="ชื่อเมนู"><input value={draft.Name} onChange={event => setDraft({ ...draft, Name: event.target.value })} /></Field>
      <Field label="รายละเอียด"><input value={draft.Description} onChange={event => setDraft({ ...draft, Description: event.target.value })} /></Field>
      <Field label="ราคา (บาท)"><input type="number" value={draft.Price} onChange={event => setDraft({ ...draft, Price: event.target.value })} /></Field>
      <Field label="จำนวนคงเหลือ" hint="ใส่ Unlimited หากไม่จำกัด"><input value={draft.Stock} onChange={event => setDraft({ ...draft, Stock: event.target.value })} /></Field>
      <Field label="รูปอาหาร"><input type="file" accept="image/*" onChange={event => compressImage(event.target.files[0]).then(imageBase64 => setDraft({ ...draft, imageBase64 }))} /></Field>
      <label className="checkline"><input type="checkbox" checked={String(draft.IsActive).toUpperCase() !== 'FALSE'} onChange={event => setDraft({ ...draft, IsActive: event.target.checked ? 'TRUE' : 'FALSE' })} /><span>เปิดขาย</span></label>
      <div className="row-actions"><button className="primary" disabled={busy} onClick={save}>บันทึก</button><button className="ghost" onClick={() => setDraft(null)}>ยกเลิก</button></div>
    </div>}
    <div className="menu-grid">{items.map(item => <article className="food-card admin-card" key={item.ID}>
      <div className="food-image" onClick={() => setDraft({ ...item })}>{item.ImageURL ? <img src={item.ImageURL} alt={item.Name} /> : '🍢'}</div>
      <div className="food-body">
        <h3>{item.Name}</h3>
        <div className="food-foot"><strong>{baht(item.Price)}</strong><span className="stock">{String(item.Stock).toUpperCase() === 'UNLIMITED' ? 'ไม่จำกัด' : `เหลือ ${item.Stock}`}</span></div>
        <div className="row-actions">
          <button onClick={() => setDraft({ ...item })}>แก้ไข</button>
          {String(item.IsActive).toUpperCase() !== 'FALSE' && <button onClick={() => remove(item.ID)}>ปิดขาย</button>}
        </div>
      </div>
    </article>)}</div>
  </div>
}

function AdminPromos({ store, token, reloadStore }) {
  const [drafts, setDrafts] = useState(() => (store.promotions || []).map(item => ({ ...item })))
  const menu = store.menu || []
  const [message, setMessage] = useState('')

  useEffect(() => { setDrafts((store.promotions || []).map(item => ({ ...item }))) }, [store.promotions])

  const typeLabels = { NewMember: 'สมาชิกใหม่', MobileBanking: 'โอนเงินผ่าน Mobile Banking', StampReward: 'แลกแสตมป์' }

  async function save(promo) {
    try {
      await api('savePromotion', { sessionToken: token, promotion: promo })
      setMessage('บันทึกแล้ว')
      await reloadStore()
    } catch (saveError) { setMessage(saveError.message) }
  }

  return <div>
    <h2>โปรโมชัน</h2>
    {message && <p className="hint">{message}</p>}
    {drafts.map(promo => <div className="card" key={promo.PromoType}>
      <b>{typeLabels[promo.PromoType] || promo.PromoType}</b>
      <Field label={promo.PromoType === 'StampReward' ? 'จำนวนแสตมป์ที่ใช้แลก' : 'เงื่อนไข'} hint={promo.PromoType === 'MobileBanking' ? 'ใช้เมื่อลูกค้าเลือกโอนเงิน' : promo.PromoType === 'NewMember' ? 'ใช้กับออเดอร์แรกของสมาชิกใหม่' : ''}>
        <input value={promo.Condition} onChange={event => setDrafts(drafts.map(row => row.PromoType === promo.PromoType ? { ...row, Condition: event.target.value } : row))} />
      </Field>
      <Field label="ส่วนลด (บาท)"><input type="number" value={promo.DiscountValue} onChange={event => setDrafts(drafts.map(row => row.PromoType === promo.PromoType ? { ...row, DiscountValue: event.target.value } : row))} /></Field>
      <Field label="แถมเมนูฟรี (ถ้ามีในตะกร้า)">
        <select value={promo.FreeMenuID || ''} onChange={event => setDrafts(drafts.map(row => row.PromoType === promo.PromoType ? { ...row, FreeMenuID: event.target.value } : row))}>
          <option value="">-- ไม่แถม --</option>
          {menu.map(item => <option key={item.ID} value={item.ID}>{item.Name}</option>)}
        </select>
      </Field>
      <label className="checkline"><input type="checkbox" checked={String(promo.IsActive).toUpperCase() !== 'FALSE'} onChange={event => setDrafts(drafts.map(row => row.PromoType === promo.PromoType ? { ...row, IsActive: event.target.checked ? 'TRUE' : 'FALSE' } : row))} /><span>เปิดใช้งาน</span></label>
      <button className="secondary" onClick={() => save(drafts.find(row => row.PromoType === promo.PromoType))}>บันทึกโปรนี้</button>
    </div>)}
  </div>
}

function AdminSettings({ store, token, reloadStore }) {
  const [draft, setDraft] = useState({ ...(store.settings || {}) })
  const [message, setMessage] = useState('')
  const keys = [
    ['StoreName', 'ชื่อร้าน'], ['StorePhone', 'เบอร์รับโอน/ติดต่อ'], ['StoreAddress', 'ที่อยู่ร้าน'],
    ['PrepMinutes', 'เวลาทำอาหารพื้นฐาน (นาที)'], ['DisputeMinutes', 'เวลาเปิดรับรายงานปัญหาหลังส่ง (นาที)'],
    ['FreeDeliveryDistanceKm', 'ระยะส่งฟรี (กม.)'], ['DeliveryFeePerKm', 'ค่าส่งต่อกิโลเมตร (บาท)'],
    ['FreeDeliveryMinimum', 'ยอดขั้นต่ำส่งฟรี (บาท)'], ['StampSpendAmount', 'ยอดซื้อต่อ 1 แสตมป์ (บาท)'],
    ['ThankYouMessage', 'ข้อความขอบคุณลูกค้า']
  ]

  async function save() {
    try {
      await api('saveSettings', { sessionToken: token, settings: draft })
      setMessage('บันทึกการตั้งค่าแล้ว')
      await reloadStore()
    } catch (saveError) { setMessage(saveError.message) }
  }

  return <div>
    <h2>ตั้งค่าร้าน</h2>
    {keys.map(([key, label]) => <Field key={key} label={label}><input value={draft[key] ?? ''} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></Field>)}
    <label className="checkline"><input type="checkbox" checked={String(draft.AcceptingOrders).toUpperCase() !== 'FALSE'} onChange={event => setDraft({ ...draft, AcceptingOrders: event.target.checked ? 'TRUE' : 'FALSE' })} /><span>เปิดรับออเดอร์</span></label>
    <Field label="ตำแหน่งร้าน (ใช้อ้างอิงค่าส่ง)" hint="ปักหมุดหรือใช้ตำแหน่งปัจจุบันของร้าน">
      <MapPicker store={draft} value={draft.StoreLat ? { lat: num(draft.StoreLat), lng: num(draft.StoreLng) } : null} onChange={point => setDraft({ ...draft, StoreLat: point.lat, StoreLng: point.lng })} />
    </Field>
    <Field label="ไอคอนแสตมป์"><input type="file" accept="image/*" onChange={event => compressImage(event.target.files[0], 400, 0.8).then(imageBase64 => setDraft({ ...draft, StampIconBase64: imageBase64 }))} /></Field>
    {draft.StampIconBase64 && <img className="preview small" src={draft.StampIconBase64} alt="stamp" />}
    {draft.StampIcon && !draft.StampIconBase64 && <img className="preview small" src={draft.StampIcon} alt="stamp" />}
    {message && <p className="hint">{message}</p>}
    <button className="primary" onClick={save}>บันทึกการตั้งค่า</button>
  </div>
}

function AdminUsers({ token, role }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const load = async () => { try { setUsers(await api('getUsers', { sessionToken: token })); setError('') } catch (loadError) { setError(loadError.message) } }
  useEffect(() => { load() }, [token])

  async function adjust(user, amount) { try { await api('adjustStamps', { sessionToken: token, userId: user.ID, amount }); await load() } catch (adjustError) { setError(adjustError.message) } }
  async function changeRole(user, nextRole) { try { await api('setUserRole', { sessionToken: token, userId: user.ID, role: nextRole }); await load() } catch (roleError) { setError(roleError.message) } }
  async function remove(user) { if (!confirm(`ลบสมาชิก ${user.Phone}?`)) return; try { await api('deleteUser', { sessionToken: token, userId: user.ID }); await load() } catch (removeError) { setError(removeError.message) } }

  return <div>
    <h2>สมาชิกและแสตมป์</h2>
    {error && <p className="hint error">{error}</p>}
    {users.map(user => <article className="order-card" key={user.ID}>
      <b>{user.Name || 'ไม่ระบุชื่อ'} · {user.Phone}</b>
      <span>บทบาท: {user.Role} · แสตมป์ {num(user.Stamps)}</span>
      <div className="row-actions">
        <button onClick={() => adjust(user, 1)}>+1 แสตมป์</button>
        <button onClick={() => adjust(user, -1)}>-1 แสตมป์</button>
        {role === 'SuperAdmin' && user.Role !== 'SuperAdmin' && <button onClick={() => changeRole(user, user.Role === 'Admin' ? 'Customer' : 'Admin')}>{user.Role === 'Admin' ? 'ถอด Admin' : 'ตั้งเป็น Admin'}</button>}
        {role === 'SuperAdmin' && <button onClick={() => remove(user)}>ลบ</button>}
      </div>
    </article>)}
  </div>
}

function AdminLogs({ token, role }) {
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (role !== 'SuperAdmin') return
    api('getAuditLogs', { sessionToken: token }).then(setLogs).catch(loadError => setError(loadError.message))
  }, [token, role])
  if (role !== 'SuperAdmin') return <p className="hint">ดูประวัติการทำงานได้เฉพาะ SuperAdmin</p>
  return <div>
    <h2>ประวัติการทำงานผู้ดูแล</h2>
    {error && <p className="hint error">{error}</p>}
    {logs.map(log => <article className="order-card" key={log.LogID}>
      <b>{log.ActionType}</b>
      <span>{log.Detail}</span>
      <small>{fmtTime(log.Timestamp)}</small>
    </article>)}
    {!logs.length && !error && <p className="hint">ยังไม่มีบันทึก</p>}
  </div>
}

function AdminQr() {
  const [image, setImage] = useState('')
  const url = useMemo(() => `${window.location.origin}${import.meta.env.BASE_URL}`, [])
  useEffect(() => { QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setImage).catch(() => setImage('')) }, [url])
  return <div className="qr-block">
    <h2>QR Code สำหรับลูกค้า</h2>
    {image ? <img src={image} alt="QR" /> : <p className="hint">สร้าง QR ไม่สำเร็จ</p>}
    <p className="hint">{url}</p>
    <button className="secondary" onClick={() => window.print()}>พิมพ์ QR</button>
  </div>
}
