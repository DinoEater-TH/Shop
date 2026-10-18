import React, { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { api, baht, beep, compressImage, fmtTime, num, orderOptions } from '../api'
import { ChatRoom, Empty, Field, MapPicker, StatusBadge } from '../components'

const TABS = [
  { key: 'orders', label: 'ออเดอร์' },
  { key: 'menu', label: 'เมนู' },
  { key: 'options', label: 'ตัวเลือกเสริม' },
  { key: 'promos', label: 'โปรโมชัน' },
  { key: 'users', label: 'สมาชิก' },
  { key: 'settings', label: 'ตั้งค่า' },
  { key: 'logs', label: 'บันทึกการทำงาน' },
  { key: 'qr', label: 'QR code' }
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
    {tab === 'orders' && <AdminOrders token={token} store={store} />}
    {tab === 'menu' && <AdminMenu token={token} reloadStore={reloadStore} />}
    {tab === 'options' && <AdminOptions token={token} />}
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

function AdminOrders({ token, store }) {
  const { data: orders, error, setData: setOrders } = usePolling(() => api('getOrders', { sessionToken: token }), !!token, 8000)
  const seen = useRef(null)
  const [detail, setDetail] = useState(null)
  const [chatOrder, setChatOrder] = useState(null)
  const [chat, setChat] = useState(null)
  const [soundOn, setSoundOn] = useState(true)
  const [sound, setSound] = useState(() => localStorage.getItem('dino-alert-sound') || '')
  const [acceptOrder, setAcceptOrder] = useState(null)
  const [acceptMinutes, setAcceptMinutes] = useState(10)

  function playAlert(times) {
    if (!sound) return beep(times)
    try { const audio = new Audio(sound); audio.play().catch(() => beep(times)) } catch { beep(times) }
  }

  useEffect(() => {
    const pending = orders.filter(order => order.Status === 'Pending').map(order => order.OrderID)
    if (seen.current === null) { seen.current = new Set(pending); return }
    const fresh = pending.filter(id => !seen.current.has(id))
    fresh.forEach(id => seen.current.add(id))
    if (fresh.length && soundOn) playAlert(fresh.length > 1 ? 5 : 3)
  }, [orders, soundOn, sound])

  useEffect(() => {
    if (!chatOrder) return
    let alive = true
    const load = async () => { try { const result = await api('getChat', { orderId: chatOrder.OrderID, sessionToken: token }); if (alive) setChat(result) } catch { /* no chat yet */ } }
    load()
    const timer = setInterval(load, 6000)
    return () => { alive = false; clearInterval(timer) }
  }, [chatOrder, token])

  async function advance(order, status, estimatedTime) {
    try {
      const updated = await api('updateOrderStatus', { sessionToken: token, orderId: order.OrderID, status, estimatedTime })
      setOrders(current => current.map(row => row.OrderID === updated.OrderID ? updated : row))
      setDetail(current => (current && current.OrderID === updated.OrderID ? updated : current))
    } catch (updateError) { alert(updateError.message) }
  }
  async function openDetail(order) {
    try { setDetail(await api('getOrder', { orderId: order.OrderID })) } catch (detailError) { alert(detailError.message) }
  }
  function openAccept(order) { setAcceptMinutes(num(store?.settings?.PrepMinutes) || num(order.EstimatedTime) || 10); setAcceptOrder(order) }
  async function confirmAccept() { const target = acceptOrder; setAcceptOrder(null); await advance(target, 'Accepted', acceptMinutes) }
  function pickSound(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { localStorage.setItem('dino-alert-sound', reader.result); setSound(reader.result); try { new Audio(reader.result).play() } catch { /* ignore */ } }
    reader.readAsDataURL(file)
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
    <div className="sound-picker">
      <label className="ghost compact">🔔 เลือกไฟล์เสียงจากเครื่อง<input type="file" accept="audio/*" hidden onChange={event => pickSound(event.target.files[0])} /></label>
      {sound && <button className="ghost compact" onClick={() => { localStorage.removeItem('dino-alert-sound'); setSound('') }}>ใช้เสียงเริ่มต้น</button>}
      <button className="ghost compact" onClick={() => playAlert(3)}>ทดลองเสียง</button>
    </div>
    {error && <p className="hint error">{error}</p>}
    {orders.map(order => <article className="order-card" key={order.OrderID}>
      <b>{order.OrderID}</b>
      <span>{order.OrderType === 'Delivery' ? 'จัดส่ง' : 'รับเอง'} · {order.PaymentMethod === 'Transfer' ? 'โอน' : 'เงินสด'} · {baht(order.Total)}</span>
      <small>{order.Phone} · {fmtTime(order.CreatedAt)}</small>
      {(order.items || []).map(item => <small key={item.ID}>• {item.MenuID} × {item.Quantity}</small>)}
      {orderOptions(order).map(group => <small key={group.groupId}>• {group.groupName}: {group.choices.join(', ')}</small>)}
      {order.queue && (order.Status === 'Pending' || order.Status === 'Accepted') && <small className="queue-line">คิวที่ {order.queue.position} · รออีกประมาณ {order.queue.waitingMinutes} นาที</small>}
      <div className="row-actions">
        <StatusBadge status={order.Status} />
        <button onClick={() => openDetail(order)}>รายละเอียด</button>
        {order.Status === 'Pending' && <button className="primary" onClick={() => openAccept(order)}>รับออเดอร์</button>}
        {order.Status === 'Accepted' && <button onClick={() => advance(order, 'Ready', num(order.EstimatedTime))}>อาหารพร้อม</button>}
        {order.Status === 'Ready' && (order.OrderType === 'Delivery'
          ? <button className="primary" onClick={() => advance(order, 'OutForDelivery', num(order.EstimatedTime))}>เริ่มจัดส่ง</button>
          : <button className="primary" onClick={() => advance(order, 'Completed', num(order.EstimatedTime))}>เสร็จสิ้น</button>)}
        {order.Status === 'OutForDelivery' && <button className="primary" onClick={() => advance(order, 'Completed', num(order.EstimatedTime))}>ส่งเสร็จแล้ว</button>}
      </div>
    </article>)}
    {!orders.length && !error && <p className="hint">ยังไม่มีออเดอร์</p>}
    {acceptOrder && <div className="modal">
      <div className="modal-card">
        <h2>รับออเดอร์</h2>
        <p className="hint">หมายเลข {acceptOrder.OrderID} · กำหนดเวลาแล้วลูกค้าจะเห็นนับถอยหลัง</p>
        <div className="minutes-stepper">
          <button onClick={() => setAcceptMinutes(value => Math.max(1, num(value) - 5))}>−5</button>
          <input type="number" min="1" value={acceptMinutes} onChange={event => setAcceptMinutes(event.target.value)} />
          <button onClick={() => setAcceptMinutes(value => num(value) + 5)}>+5</button>
          <span>นาที</span>
        </div>
        <button className="primary" onClick={confirmAccept}>ยืนยันรับออเดอร์ · {num(acceptMinutes)} นาที</button>
        <button className="ghost" onClick={() => setAcceptOrder(null)}>ยกเลิก</button>
      </div>
    </div>}
    {chatOrder && <div className="modal">
      <div className="modal-card">
        <div className="row-between"><h2>แชทออเดอร์ {chatOrder.OrderID}</h2><button className="ghost compact" onClick={() => { setChatOrder(null); setChat(null) }}>ปิด</button></div>
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
    {order.queue && (order.Status === 'Pending' || order.Status === 'Accepted') && <p className="hint">คิวที่ {order.queue.position} จาก {order.queue.totalInQueue} · รออีกประมาณ {order.queue.waitingMinutes} นาที</p>}
    <div className="receipt">
      <div><span>ลูกค้า</span><b>{order.Phone}</b></div>
      <div><span>รูปแบบ</span><b>{order.OrderType === 'Delivery' ? 'จัดส่ง' : 'รับเอง'}</b></div>
      {order.AddressDetail && <div><span>ที่อยู่</span><b>{order.AddressDetail}</b></div>}
      {num(order.Distance) > 0 && <div><span>ระยะทาง</span><b>{num(order.Distance)} กม.</b></div>}
      {(order.items || []).map(item => <div key={item.ID}><span>{item.MenuID} × {item.Quantity}</span><b>{baht(num(item.Price) * num(item.Quantity))}</b></div>)}
      {orderOptions(order).map(group => <div className="option-line" key={group.groupId}><span>{group.groupName}</span><b>{group.choices.join(', ')}</b></div>)}
      <div><span>ค่าอาหาร</span><b>{baht(order.SubTotal)}</b></div>
      {num(order.DeliveryFee) > 0 && <div><span>ค่าจัดส่ง</span><b>{baht(order.DeliveryFee)}</b></div>}
      {num(order.Discount) > 0 && <div className="discount-line"><span>ส่วนลด</span><b>-{baht(order.Discount)}</b></div>}
      <div className="grand"><span>ยอดสุทธิ</span><b>{baht(order.Total)}</b></div>
    </div>
    {order.SlipURL && <p className="hint"><a href={order.SlipURL} target="_blank" rel="noreferrer">ดูสลิปโอนเงิน</a></p>}
    <Field label="เวลาทำอาหาร (นาที)"><input type="number" min="1" value={minutes} onChange={event => setMinutes(event.target.value)} /></Field>
    <div className="row-actions">
      {order.Status === 'Pending' && <button className="primary" onClick={() => onAdvance(order, 'Accepted', minutes)}>รับออเดอร์</button>}
      {order.Status === 'Accepted' && <>
        <button className="primary" onClick={() => onAdvance(order, 'Ready', minutes)}>อาหารพร้อม</button>
        <button className="secondary" onClick={() => onAdvance(order, 'Accepted', minutes)}>อัปเดตเวลา</button>
      </>}
      {order.Status === 'Ready' && (order.OrderType === 'Delivery'
        ? <button className="primary" onClick={() => onAdvance(order, 'OutForDelivery', minutes)}>เริ่มจัดส่ง</button>
        : <button className="primary" onClick={() => onAdvance(order, 'Completed', minutes)}>เสร็จสิ้น</button>)}
      {order.Status === 'OutForDelivery' && <button className="primary" onClick={() => onAdvance(order, 'Completed', minutes)}>ส่งเสร็จแล้ว</button>}
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

  const [driveOpen, setDriveOpen] = useState(false)
  const [driveImages, setDriveImages] = useState([])
  const [driveError, setDriveError] = useState('')

  async function openDrive() {
    setDriveOpen(true)
    setDriveError('')
    try { setDriveImages(await api('listDriveImages', { sessionToken: token })) } catch (driveLoadError) { setDriveError(driveLoadError.message) }
  }
  async function pickDrive(fileId) {
    try {
      const url = await api('useDriveImage', { sessionToken: token, fileId })
      setDraft(current => ({ ...current, ImageURL: url, imageBase64: '' }))
      setDriveOpen(false)
    } catch (pickError) { setDriveError(pickError.message) }
  }

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
      <Field label="รูปอาหาร">
        <input type="file" accept="image/*" onChange={event => compressImage(event.target.files[0]).then(imageBase64 => setDraft({ ...draft, imageBase64 }))} />
        <button type="button" className="ghost compact" onClick={openDrive}>เลือกจาก Google Drive</button>
      </Field>
      {(draft.imageBase64 || draft.ImageURL) && <img className="preview" src={draft.imageBase64 || draft.ImageURL} alt="ตัวอย่างรูป" />}
      <label className="checkline"><input type="checkbox" checked={String(draft.IsActive).toUpperCase() !== 'FALSE'} onChange={event => setDraft({ ...draft, IsActive: event.target.checked ? 'TRUE' : 'FALSE' })} /><span>เปิดขาย</span></label>
      <div className="row-actions"><button className="primary" disabled={busy} onClick={save}>บันทึก</button><button className="ghost" onClick={() => setDraft(null)}>ยกเลิก</button></div>
    </div>}
    {driveOpen && <div className="modal">
      <div className="modal-card">
        <h2>เลือกรูปจาก Google Drive</h2>
        <p className="hint">รูปจากโฟลเดอร์ "DinoEater Uploads" — กดรูปเพื่อใช้กับเมนูนี้</p>
        {driveError && <p className="hint error">{driveError}</p>}
        <div className="drive-grid">
          {driveImages.map(image => <button key={image.id} type="button" className="drive-item" onClick={() => pickDrive(image.id)}><img src={`https://drive.google.com/thumbnail?id=${image.id}&sz=w400`} alt={image.name} /><span>{image.name}</span></button>)}
        </div>
        {!driveImages.length && !driveError && <p className="hint">ไม่พบรูปในโฟลเดอร์</p>}
        <div className="row-actions"><button className="ghost" onClick={() => setDriveOpen(false)}>ปิด</button></div>
      </div>
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

function AdminOptions({ token }) {
  const [groups, setGroups] = useState([])
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => { try { setGroups(await api('getOptionGroups', { sessionToken: token })); setError('') } catch (loadError) { setError(loadError.message) } }
  useEffect(() => { load() }, [token])

  function addChoice() { setDraft(current => ({ ...current, choices: [...(current.choices || []), ''] })) }
  function setChoice(index, value) { setDraft(current => ({ ...current, choices: current.choices.map((label, i) => i === index ? value : label) })) }
  function removeChoice(index) { setDraft(current => ({ ...current, choices: current.choices.filter((label, i) => i !== index) })) }
  async function save() {
    const labels = (draft.choices || []).map(label => String(label).trim()).filter(Boolean)
    if (!String(draft.Name).trim()) return setError('กรุณาระบุชื่อตัวเลือกเสริม')
    if (!labels.length) return setError('กรุณาเพิ่มตัวเลือกอย่างน้อย 1 อย่าง')
    setBusy(true)
    try { await api('saveOptionGroup', { sessionToken: token, group: draft, choices: labels }); setDraft(null); await load() } catch (saveError) { setError(saveError.message) } finally { setBusy(false) }
  }
  async function remove(group) {
    if (!confirm(`ลบตัวเลือกเสริม "${group.Name}"?`)) return
    try { await api('deleteOptionGroup', { sessionToken: token, groupId: group.GroupID }); await load() } catch (removeError) { setError(removeError.message) }
  }

  return <div>
    <div className="row-between"><h2>ตัวเลือกเสริม</h2><button className="primary compact" onClick={() => setDraft({ Name: '', Required: false, MultiSelect: false, IsActive: 'TRUE', choices: [''] })}>+ เพิ่ม</button></div>
    <p className="hint">ตอนลูกค้ากดยืนยันออเดอร์ ระบบจะให้เลือกกลุ่มเหล่านี้ก่อนส่งออเดอร์ให้ร้าน แต่ละกลุ่มกำหนดได้ว่าจะ "บังคับเลือก" หรือไม่ และเลือกได้อย่างเดียวหรือหลายอย่าง</p>
    {error && <p className="hint error">{error}</p>}
    {draft && <div className="card">
      <Field label="ชื่อตัวเลือกเสริม"><input value={draft.Name} onChange={event => setDraft({ ...draft, Name: event.target.value })} placeholder="เช่น รับไม้หรือไม่" /></Field>
      <div className="option-choices-edit">
        <span className="hint">ตัวเลือกในกลุ่มนี้ (เพิ่มได้เรื่อย ๆ)</span>
        {(draft.choices || []).map((label, index) => <div className="option-edit-row" key={index}>
          <input value={label} onChange={event => setChoice(index, event.target.value)} placeholder={`ตัวเลือก ${index + 1}`} />
          <button className="ghost compact" onClick={() => removeChoice(index)}>ลบ</button>
        </div>)}
        <button className="ghost compact" onClick={addChoice}>+ เพิ่มตัวเลือก</button>
      </div>
      <label className="checkline"><input type="checkbox" checked={!!draft.Required} onChange={event => setDraft({ ...draft, Required: event.target.checked })} /><span>บังคับให้ลูกค้าต้องเลือก</span></label>
      <label className="checkline"><input type="checkbox" checked={!!draft.MultiSelect} onChange={event => setDraft({ ...draft, MultiSelect: event.target.checked })} /><span>เลือกได้หลายอย่าง (ไม่ติ๊ก = เลือกได้อย่างเดียว)</span></label>
      <label className="checkline"><input type="checkbox" checked={String(draft.IsActive).toUpperCase() !== 'FALSE'} onChange={event => setDraft({ ...draft, IsActive: event.target.checked ? 'TRUE' : 'FALSE' })} /><span>เปิดใช้งาน</span></label>
      <div className="row-actions"><button className="primary" disabled={busy} onClick={save}>บันทึก</button><button className="ghost" onClick={() => setDraft(null)}>ยกเลิก</button></div>
    </div>}
    {groups.map(group => <article className="order-card" key={group.GroupID}>
      <b>{group.Name} {String(group.IsActive) === 'true' || group.IsActive === true ? '' : '(ปิด)'}</b>
      <span>{group.Required ? 'ต้องเลือก' : 'ไม่บังคับ'} · {group.MultiSelect ? 'เลือกได้หลายอย่าง' : 'เลือกได้อย่างเดียว'} · {group.choices.map(choice => choice.Label).join(' / ')}</span>
      <div className="row-actions">
        <button onClick={() => setDraft({ Name: group.Name, Required: group.Required, MultiSelect: group.MultiSelect, IsActive: group.IsActive ? 'TRUE' : 'FALSE', SortOrder: group.SortOrder, GroupID: group.GroupID, choices: group.choices.map(choice => choice.Label) })}>แก้ไข</button>
        <button onClick={() => remove(group)}>ลบ</button>
      </div>
    </article>)}
    {!groups.length && !error && <p className="hint">ยังไม่มีตัวเลือกเสริม — กด "เพิ่ม" เพื่อสร้าง (เช่น "รับไม้หรือไม่")</p>}
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
  const [query, setQuery] = useState('')
  const [member, setMember] = useState(null)
  const load = async () => { try { setUsers(await api('getUsers', { sessionToken: token })); setError('') } catch (loadError) { setError(loadError.message) } }
  useEffect(() => { load() }, [token])

  async function adjust(user, amount) { try { await api('adjustStamps', { sessionToken: token, userId: user.ID, amount }); await load() } catch (adjustError) { setError(adjustError.message) } }
  async function changeRole(user, nextRole) { try { await api('setUserRole', { sessionToken: token, userId: user.ID, role: nextRole }); await load() } catch (roleError) { setError(roleError.message) } }
  async function remove(user) { if (!confirm(`ลบสมาชิก ${user.Phone}?`)) return; try { await api('deleteUser', { sessionToken: token, userId: user.ID }); await load() } catch (removeError) { setError(removeError.message) } }
  async function openMember(user) { try { setMember(await api('getMemberDetail', { sessionToken: token, userId: user.ID })) } catch (memberError) { setError(memberError.message) } }

  if (member) return <MemberDetail detail={member} onClose={() => setMember(null)} />

  const digits = query.replace(/\D/g, '')
  const filtered = query.trim()
    ? users.filter(user => (digits && String(user.Phone || '').includes(digits)) || String(user.Name || '').toLowerCase().includes(query.trim().toLowerCase()))
    : users

  return <div>
    <h2>สมาชิกและแสตมป์</h2>
    <Field label="ค้นหาด้วยเบอร์โทรหรือชื่อ" hint={`พบ ${filtered.length} บัญชี จากทั้งหมด ${users.length} · แตะชื่อเพื่อดูประวัติ`}>
      <input value={query} inputMode="tel" onChange={event => setQuery(event.target.value)} placeholder="เช่น 0812345678 หรือชื่อลูกค้า" />
    </Field>
    {error && <p className="hint error">{error}</p>}
    {!filtered.length && !error && <p className="hint">ไม่พบบัญชีตามเงื่อนไข</p>}
    {filtered.map(user => <article className="order-card" key={user.ID}>
      <button className="member-link" onClick={() => openMember(user)}>{user.Name || 'ไม่ระบุชื่อ'} · {user.Phone} ›</button>
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

function MemberDetail({ detail, onClose }) {
  const { user, orders, stats } = detail
  const [expanded, setExpanded] = useState('')
  return <div>
    <button className="ghost" onClick={onClose}>← กลับรายชื่อสมาชิก</button>
    <h2>โปรไฟล์สมาชิก</h2>
    <div className="profile-head">
      <img src={user.ProfilePic || ''} alt="" onError={event => { event.target.style.visibility = 'hidden' }} />
      <div>
        <b>{user.Name || 'ไม่ระบุชื่อ'}</b>
        <small>{user.Phone}</small>
        <small>บทบาท: {user.Role} · สมัคร {fmtTime(user.CreatedAt)}</small>
      </div>
    </div>
    <div className="stat-grid">
      <div><b>{num(user.Stamps)}</b><small>แสตมป์</small></div>
      <div><b>{num(stats.orderCount)}</b><small>ออเดอร์ทั้งหมด</small></div>
      <div><b>{num(stats.completedCount)}</b><small>สำเร็จ</small></div>
      <div><b>{baht(stats.totalSpent)}</b><small>ยอดใช้จ่าย</small></div>
      <div><b>{num(stats.cash)} / {num(stats.transfer)}</b><small>เงินสด / โอนเงิน</small></div>
    </div>
    <h2>ประวัติการสั่งซื้อ</h2>
    {!orders.length && <p className="hint">ยังไม่มีประวัติการสั่งซื้อ</p>}
    {orders.map(order => <article className="order-card" key={order.OrderID}>
      <div className="row-between"><b>{fmtTime(order.CreatedAt)}</b><StatusBadge status={order.Status} /></div>
      <small>{order.OrderType === 'Delivery' ? 'จัดส่ง' : 'รับเอง'} · {order.PaymentMethod === 'Transfer' ? 'โอนเงิน' : 'เงินสด'} · {baht(order.Total)}</small>
      <button className="ghost compact" onClick={() => setExpanded(expanded === order.OrderID ? '' : order.OrderID)}>{expanded === order.OrderID ? 'ซ่อนรายการ' : 'ดูรายการ'}</button>
      {expanded === order.OrderID && <div className="receipt">
        {(order.items || []).map(item => <div key={item.ID}><span>{item.MenuID} × {item.Quantity}</span><b>{baht(num(item.Price) * num(item.Quantity))}</b></div>)}
      </div>}
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
