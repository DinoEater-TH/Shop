import React, { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { api, baht, beep, compressImage, driveImage, fmtTime, isNewItem, num, orderOptions, promoOf } from '../api'
import { ChatRoom, Empty, Field, MapPicker, Receipt, StatusBadge } from '../components'
import { t, useLang } from '../i18n'

const TABS = () => [
  { key: 'orders', label: t('ออเดอร์') },
  { key: 'pos', label: t('สั่งแทนลูกค้า') },
  { key: 'menu', label: t('เมนู') },
  { key: 'categories', label: t('หมวดหมู่') },
  { key: 'options', label: t('ตัวเลือกเสริม') },
  { key: 'promos', label: t('โปรโมชัน') },
  { key: 'users', label: t('สมาชิก') },
  { key: 'settings', label: t('ตั้งค่า') },
  { key: 'logs', label: t('บันทึกการทำงาน') },
  { key: 'qr', label: t('QR code') }
]

export default function AdminScreen({ store, reloadStore, user, requireLogin }) {
  useLang()
  const [tab, setTab] = useState('pos')
  const token = user?.SessionToken
  const tabs = TABS()

  if (!user || !['Admin', 'SuperAdmin'].includes(user.Role)) return <section className="page">
    <h1>{t('สำหรับผู้ดูแลร้าน')}</h1>
    <p className="hint">{t('กรุณาเข้าสู่ระบบด้วยบัญชีที่มีบทบาท Admin หรือ SuperAdmin')}</p>
    <button className="primary" onClick={requireLogin}>{t('ไปหน้าเข้าสู่ระบบ')}</button>
  </section>

  return <section className="page admin">
    <h1>{t('หน้าร้าน')}</h1>
    <div className="tabs">{tabs.map(item => <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    {tab === 'orders' && <AdminOrders token={token} store={store} />}
    {tab === 'pos' && <AdminPos token={token} store={store} />}
    {tab === 'menu' && <AdminMenu token={token} reloadStore={reloadStore} categories={store.categories || []} />}
    {tab === 'categories' && <AdminCategories token={token} reloadStore={reloadStore} categories={store.categories || []} />}
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
  const { data: orders, error, setData: setOrders } = usePolling(() => api('getOrders', { sessionToken: token }, true), !!token, 8000)
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
    const load = async () => { try { const result = await api('getChat', { orderId: chatOrder.OrderID, sessionToken: token }, true); if (alive) setChat(result) } catch { /* no chat yet */ } }
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

function AdminMenu({ token, reloadStore, categories }) {
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
      setDraft(current => ({ ...current, ImageURL: url.replace('&sz=w1000','&sz=w1600').replace('&sz=w400','&sz=w1600').replace('?sz=w1000','?sz=w1600'), imageBase64: '' }))
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
      <div className="row-between"><h2>จัดการเมนู</h2><button className="primary compact" onClick={() => setDraft({ Name: '', Description: '', Price: 0, Stock: 'Unlimited', StockStatus: '', SoldOutDate: '', IsActive: 'TRUE', NewAt: '', CategoryID: '' })}>+ เพิ่มเมนู</button></div>
    {error && <p className="hint error">{error}</p>}
    {draft && <div className="card">
      <Field label="ชื่อเมนู"><input value={draft.Name} onChange={event => setDraft({ ...draft, Name: event.target.value })} /></Field>
      <Field label="รายละเอียด"><input value={draft.Description} onChange={event => setDraft({ ...draft, Description: event.target.value })} /></Field>
      <Field label="ราคา (บาท)"><input type="number" value={draft.Price} onChange={event => setDraft({ ...draft, Price: event.target.value })} /></Field>
      <Field label="หมวดหมู่">
        <select value={draft.CategoryID || ''} onChange={event => setDraft({ ...draft, CategoryID: event.target.value })}>
          <option value="">-- ไม่จัดหมวด --</option>
          {categories.filter(c => !c.ParentID).map(main => <React.Fragment key={main.CategoryID}>
            <option value={main.CategoryID}>{main.Name}</option>
            {categories.filter(c => String(c.ParentID) === String(main.CategoryID)).map(sub => <option key={sub.CategoryID} value={sub.CategoryID}>&nbsp;&nbsp;└ {sub.Name}</option>)}
          </React.Fragment>)}
        </select>
      </Field>
      <Field label="สถานะสต็อก">
        <select value={draft.StockStatus || ''} onChange={event => setDraft({ ...draft, StockStatus: event.target.value })}>
          <option value="">มีจำหน่าย (ใช้จำนวนคงเหลือ)</option>
          <option value="SoldOutDaily">หมด — reset อัตโนมัติวันต่อวัน</option>
          <option value="SoldOutPermanent">หมดไม่มีกำหนด</option>
          <option value="Hidden">ซ่อนจากลูกค้า</option>
        </select>
      </Field>
      {(!draft.StockStatus || draft.StockStatus === '') && <Field label="จำนวนคงเหลือ" hint="ใส่ Unlimited หากไม่จำกัด"><input value={draft.Stock} onChange={event => setDraft({ ...draft, Stock: event.target.value })} /></Field>}
      <Field label="รูปอาหาร">
        <input type="file" accept="image/*" onChange={event => compressImage(event.target.files[0], 1600, 0.85).then(imageBase64 => setDraft({ ...draft, imageBase64 }))} />
        <button type="button" className="ghost compact" onClick={openDrive}>เลือกจาก Google Drive</button>
      </Field>
      {(draft.imageBase64 || draft.ImageURL) && <img className="preview" src={draft.imageBase64 || driveImage(draft.ImageURL, 600)} alt="ตัวอย่างรูป" />}
      <label className="checkline"><input type="checkbox" checked={String(draft.IsActive).toUpperCase() !== 'FALSE'} onChange={event => setDraft({ ...draft, IsActive: event.target.checked ? 'TRUE' : 'FALSE' })} /><span>เปิดขาย</span></label>
      <label className="checkline"><input type="checkbox" checked={isNewItem(draft)} onChange={event => setDraft({ ...draft, NewAt: event.target.checked ? (isNewItem(draft) ? draft.NewAt : new Date().toISOString()) : '' })} /><span>เมนูใหม่ — ขึ้นป้าย "New · อยากให้ลอง" (ปลดอัตโนมัติใน 1 เดือน)</span></label>
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
      {isNewItem(item) && <span className="new-badge">New · อยากให้ลอง</span>}
      <div className="food-image" onClick={() => setDraft({ ...item })}>{item.ImageURL ? <img src={driveImage(item.ImageURL, 600)} alt={item.Name} loading="lazy" /> : '🍢'}</div>
      <div className="food-body">
        <h3>{item.Name}</h3>
        <div className="food-foot"><strong>{baht(item.Price)}</strong>
          {item.StockStatus === 'SoldOutDaily' && <span className="stock-badge soldout-daily">หมดวันนี้</span>}
          {item.StockStatus === 'SoldOutPermanent' && <span className="stock-badge soldout-permanent">หมดไม่มีกำหนด</span>}
          {item.StockStatus === 'Hidden' && <span className="stock-badge hidden">ซ่อน</span>}
          {(!item.StockStatus || item.StockStatus === '') && <span className="stock">{String(item.Stock).toUpperCase() === 'UNLIMITED' ? 'ไม่จำกัด' : `เหลือ ${item.Stock}`}</span>}
        </div>
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
  const [driveOpen, setDriveOpen] = useState(false)
  const [driveImages, setDriveImages] = useState([])
  const [driveError, setDriveError] = useState('')
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
  async function openDrive() {
    setDriveOpen(true); setDriveError('')
    try { setDriveImages(await api('listDriveImages', { sessionToken: token })) } catch (driveLoadError) { setDriveError(driveLoadError.message) }
  }
  async function pickDrive(fileId) {
    try { const url = await api('useDriveImage', { sessionToken: token, fileId }); setDraft(current => ({ ...current, StoreLogo: url, StoreLogoBase64: '' })); setDriveOpen(false) } catch (pickError) { setDriveError(pickError.message) }
  }
  const logoPreview = draft.StoreLogoBase64 || (draft.StoreLogo ? driveImage(draft.StoreLogo, 400) : '')

  return <div>
    <h2>{t('ตั้งค่าร้าน')}</h2>
    <p className="hint">{t('ชื่อร้านและโลโก้จะแสดงมุมบนซ้ายของแอป')}</p>
    {keys.map(([key, label]) => <Field key={key} label={label}><input value={draft[key] ?? ''} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></Field>)}
    <label className="checkline"><input type="checkbox" checked={String(draft.AcceptingOrders).toUpperCase() !== 'FALSE'} onChange={event => setDraft({ ...draft, AcceptingOrders: event.target.checked ? 'TRUE' : 'FALSE' })} /><span>{t('เปิดรับออเดอร์')}</span></label>
    <Field label={t('โลโก้ร้าน')} hint={t('แสดงมุมบนซ้ายและหน้าแรก · เปลี่ยนได้ตลอดเวลา')}>
      <input type="file" accept="image/*" onChange={event => compressImage(event.target.files[0], 800, 0.85).then(imageBase64 => setDraft({ ...draft, StoreLogoBase64: imageBase64 }))} />
      <button type="button" className="ghost compact" onClick={openDrive}>เลือกจาก Google Drive</button>
      {logoPreview && <button type="button" className="ghost compact" onClick={() => setDraft({ ...draft, StoreLogo: '', StoreLogoBase64: '' })}>ล้างโลโก้</button>}
    </Field>
    {logoPreview && <img className="preview logo" src={logoPreview} alt="logo" />}
    <Field label="ตำแหน่งร้าน (ใช้อ้างอิงค่าส่ง)" hint="ปักหมุดหรือใช้ตำแหน่งปัจจุบันของร้าน">
      <MapPicker store={draft} value={draft.StoreLat ? { lat: num(draft.StoreLat), lng: num(draft.StoreLng) } : null} onChange={point => setDraft({ ...draft, StoreLat: point.lat, StoreLng: point.lng })} />
    </Field>
    <Field label="ไอคอนแสตมป์"><input type="file" accept="image/*" onChange={event => compressImage(event.target.files[0], 400, 0.8).then(imageBase64 => setDraft({ ...draft, StampIconBase64: imageBase64 }))} /></Field>
    {draft.StampIconBase64 && <img className="preview small" src={draft.StampIconBase64} alt="stamp" />}
    {draft.StampIcon && !draft.StampIconBase64 && <img className="preview small" src={draft.StampIcon} alt="stamp" />}
    {driveOpen && <div className="modal">
      <div className="modal-card">
        <h2>เลือกรูปจาก Google Drive</h2>
        <p className="hint">รูปจากโฟลเดอร์ "DinoEater Uploads" — กดรูปเพื่อใช้เป็นโลโก้ร้าน</p>
        {driveError && <p className="hint error">{driveError}</p>}
        <div className="drive-grid">
          {driveImages.map(image => <button key={image.id} type="button" className="drive-item" onClick={() => pickDrive(image.id)}><img src={`https://drive.google.com/thumbnail?id=${image.id}&sz=w400`} alt={image.name} /><span>{image.name}</span></button>)}
        </div>
        {!driveImages.length && !driveError && <p className="hint">ไม่พบรูปในโฟลเดอร์</p>}
        <div className="row-actions"><button className="ghost" onClick={() => setDriveOpen(false)}>ปิด</button></div>
      </div>
    </div>}
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

function AdminPos({ token, store }) {
  const menu = (store.menu || []).filter(item => String(item.IsActive).toUpperCase() !== 'FALSE')
  const optionGroups = store.options || []
  const promos = store.promotions || []
  const [cart, setCart] = useState({})
  const [phone, setPhone] = useState('')
  const [member, setMember] = useState(null)
  const [checked, setChecked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ orderType: 'Pickup', paymentMethod: 'Cash', address: '', deliveryFee: '', redeem: false })
  const [selection, setSelection] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  const rows = menu.map(item => ({ item, qty: num(cart[item.ID]) })).filter(row => row.qty > 0)
  const subtotal = rows.reduce((sum, row) => sum + num(row.item.Price) * row.qty, 0)
  const deliveryFee = form.orderType === 'Delivery' ? Math.max(0, num(form.deliveryFee)) : 0

  function freeItemValue(promo) {
    if (!promo || !promo.FreeMenuID) return 0
    const row = rows.find(entry => String(entry.item.ID) === String(promo.FreeMenuID))
    return row ? num(row.item.Price) : 0
  }
  const lines = []
  const memberPromo = promoOf(promos, 'NewMember')
  if (member && member.IsFirstOrder && memberPromo) lines.push({ label: 'สมาชิกใหม่', value: num(memberPromo.DiscountValue) + freeItemValue(memberPromo) })
  const bankPromo = promoOf(promos, 'MobileBanking')
  if (form.paymentMethod === 'Transfer' && bankPromo) lines.push({ label: 'ส่วนลดโอนเงิน', value: num(bankPromo.DiscountValue) + freeItemValue(bankPromo) })
  const reward = promoOf(promos, 'StampReward')
  const canRedeem = !!member && !!reward && num(member.Stamps) >= num(reward.Condition)
  if (form.redeem && canRedeem) lines.push({ label: `แลก ${num(reward.Condition)} แสตมป์`, value: num(reward.DiscountValue) + freeItemValue(reward) })
  const discount = Math.min(subtotal + deliveryFee, lines.reduce((sum, line) => sum + line.value, 0))
  const total = Math.max(0, subtotal + deliveryFee - discount)

  const filtered = menu.filter(item => !query.trim() || String(item.Name).toLowerCase().includes(query.trim().toLowerCase()))

  function setQty(id, delta) {
    setCart(current => ({ ...current, [id]: Math.max(0, num(current[id]) + delta) }))
  }
  async function checkMember() {
    const digits = String(phone).replace(/\D/g, '')
    setMember(null)
    setChecked(false)
    if (!digits) return
    setChecking(true)
    try {
      const data = await api('lookupMember', { sessionToken: token, phone: digits })
      setMember(data.exists ? data : null)
      setChecked(true)
      setError('')
    } catch (lookupError) { setError(lookupError.message) } finally { setChecking(false) }
  }
  function toggleOption(group, label) {
    setSelection(current => {
      const picked = current[group.GroupID] || []
      if (group.MultiSelect) return { ...current, [group.GroupID]: picked.includes(label) ? picked.filter(item => item !== label) : picked.concat(label) }
      return { ...current, [group.GroupID]: picked.includes(label) ? [] : [label] }
    })
  }
  function reset() {
    setCart({}); setPhone(''); setMember(null); setChecked(false); setQuery(''); setSelection({}); setError(''); setDone(null)
    setForm({ orderType: 'Pickup', paymentMethod: 'Cash', address: '', deliveryFee: '', redeem: false })
  }
  async function submit() {
    const items = rows.map(row => ({ menuId: row.item.ID, quantity: row.qty, price: num(row.item.Price) }))
    if (!items.length) return setError('กรุณาเลือกรายการอาหารอย่างน้อย 1 รายการ')
    const digits = String(phone).replace(/\D/g, '')
    if (digits && !/^0\d{8,9}$/.test(digits)) return setError('เบอร์โทรศัพท์ไม่ถูกต้อง หรือเว้นว่างเพื่อไม่ระบุเบอร์')
    if (form.orderType === 'Delivery' && !form.address.trim()) return setError('กรุณาระบุที่อยู่จัดส่ง')
    const missing = optionGroups.filter(group => group.Required && !(selection[group.GroupID] || []).length)
    if (missing.length) return setError(`กรุณาเลือก: ${missing.map(group => group.Name).join(', ')}`)
    setError(''); setBusy(true)
    try {
      const order = await api('createOrderByAdmin', {
        sessionToken: token,
        order: {
          phone: digits, orderType: form.orderType, addressDetail: form.address,
          deliveryFee, paymentMethod: form.paymentMethod,
          subTotal: subtotal, discount, total,
          redeemStamps: form.redeem && canRedeem,
          options: optionGroups.map(group => ({ groupId: group.GroupID, groupName: group.Name, choices: selection[group.GroupID] || [] })).filter(group => group.choices.length)
        },
        items
      })
      setDone(order)
      setCart({}); setPhone(''); setMember(null); setChecked(false); setSelection({})
      setForm(current => ({ ...current, redeem: false }))
    } catch (submitError) { setError(submitError.message) } finally { setBusy(false) }
  }

  return <div>
    <div className="row-between"><h2>สร้างออเดอร์แทนลูกค้า</h2></div>
    <p className="hint">สำหรับลูกค้าที่ลืมมือถือหรือสแกน QR ไม่ได้ — เลือกเมนูและจำนวนให้ แล้วระบุเบอร์สมาชิก (ไม่บังคับ) เพื่อรับสิทธิพิเศษ</p>
    {done && <div className="receipt pos-done">
      <div><span>สร้างออเดอร์แล้ว</span><b>{done.OrderID}</b></div>
      <div><span>เบอร์ลูกค้า</span><b>{done.Phone || 'ไม่ระบุ'}</b></div>
      <div><span>ยอดสุทธิ</span><b>{baht(done.Total)}</b></div>
      <button className="ghost" onClick={() => setDone(null)}>ปิด</button>
    </div>}

    <Field label="เบอร์โทรศัพท์สมาชิก (ไม่บังคับ)" hint={member ? `${member.Name || 'สมาชิก'} · ${num(member.Stamps)} แสตมป์${member.Role !== 'Customer' ? ' · ' + member.Role : ''}` : (checked ? 'ไม่พบสมาชิก — จะบันทึกเป็นลูกค้าทั่วไป' : (phone.replace(/\D/g, '') ? 'กด "ตรวจสอบ" เพื่อค้นหาสมาชิก' : 'เว้นว่างได้ ถ้าลูกค้าไม่ได้เป็นสมาชิก'))}>
      <div className="pos-phone">
        <input value={phone} inputMode="tel" placeholder="08x-xxx-xxxx" onChange={event => { setPhone(event.target.value); setMember(null); setChecked(false) }} onBlur={checkMember} />
        <button className="ghost compact" disabled={checking} onClick={checkMember}>{checking ? 'กำลังค้นหา...' : 'ตรวจสอบ'}</button>
      </div>
    </Field>

    <div className="choice">
      <button className={form.orderType === 'Pickup' ? 'selected' : ''} onClick={() => setForm({ ...form, orderType: 'Pickup' })}>รับหน้าร้าน</button>
      <button className={form.orderType === 'Delivery' ? 'selected' : ''} onClick={() => setForm({ ...form, orderType: 'Delivery' })}>ให้ร้านไปส่ง</button>
    </div>
    {form.orderType === 'Delivery' && <>
      <Field label="รายละเอียดที่อยู่"><input value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder="บ้านเลขที่ / จุดสังเกต" /></Field>
      <Field label="ค่าจัดส่ง (บาท)"><input value={form.deliveryFee} inputMode="numeric" onChange={event => setForm({ ...form, deliveryFee: event.target.value.replace(/[^\d.]/g, '') })} placeholder="0" /></Field>
    </>}

    <div className="choice">
      <button className={form.paymentMethod === 'Cash' ? 'selected' : ''} onClick={() => setForm({ ...form, paymentMethod: 'Cash' })}>เงินสด</button>
      <button className={form.paymentMethod === 'Transfer' ? 'selected' : ''} onClick={() => setForm({ ...form, paymentMethod: 'Transfer' })}>โอนเงิน</button>
    </div>

    <Field label="ค้นหาเมนู"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ชื่อเมนู" /></Field>
    <div className="menu-grid pos-grid">{filtered.map(item => <article className="food-card admin-card" key={item.ID}>
      <div className="food-image">{item.ImageURL ? <img src={driveImage(item.ImageURL, 400)} alt={item.Name} loading="lazy" /> : '🍢'}</div>
      <div className="food-body">
        <h3>{item.Name}</h3>
        <div className="food-foot"><strong>{baht(item.Price)}</strong><span className="stock">{String(item.Stock).toUpperCase() === 'UNLIMITED' ? 'ไม่จำกัด' : `เหลือ ${num(item.Stock)}`}</span></div>
        <div className="stepper pos-stepper">
          <button onClick={() => setQty(item.ID, -1)} disabled={!num(cart[item.ID])}>−</button>
          <b>{num(cart[item.ID])}</b>
          <button onClick={() => setQty(item.ID, 1)}>+</button>
        </div>
      </div>
    </article>)}</div>
    {!filtered.length && <Empty text="ไม่พบเมนู" />}

    {rows.length > 0 && <div className="cart-list">
      {rows.map(row => <div className="cart-row" key={row.item.ID}><div className="emoji">🍢</div><div><b>{row.item.Name}</b><small>{row.qty} × {baht(row.item.Price)}</small></div><b>{baht(num(row.item.Price) * row.qty)}</b></div>)}
    </div>}

    {optionGroups.length > 0 && <div className="pos-options">
      <h3>ตัวเลือกเสริม</h3>
      {optionGroups.map(group => <div className="option-group" key={group.GroupID}>
        <div className="option-head">
          <b>{group.Name}{group.Required ? ' *' : ''}</b>
          <small>{group.MultiSelect ? 'เลือกได้หลายอย่าง' : 'เลือกได้อย่างเดียว'}{group.Required ? ' · ต้องเลือก' : ' · ไม่บังคับ'}</small>
        </div>
        <div className="option-choices">
          {group.choices.map(choice => {
            const active = (selection[group.GroupID] || []).includes(choice.Label)
            return <button key={choice.ChoiceID} className={active ? 'selected' : ''} onClick={() => toggleOption(group, choice.Label)}>{choice.Label}</button>
          })}
        </div>
      </div>)}
    </div>}

    {canRedeem && <label className="checkline"><input type="checkbox" checked={form.redeem} onChange={event => setForm({ ...form, redeem: event.target.checked })} /><span>ใช้ {num(reward.Condition)} แสตมป์แลกส่วนลด {baht(reward.DiscountValue)} (มี {num(member.Stamps)} แสตมป์)</span></label>}

    <Receipt subtotal={subtotal} deliveryFee={deliveryFee} discount={discount} total={total} lines={lines} />
    {error && <p className="hint error">{error}</p>}
    <button className="primary" disabled={busy || !rows.length} onClick={submit}>{busy ? 'กำลังสร้างออเดอร์...' : 'สร้างออเดอร์'}</button>
    <button className="ghost" onClick={reset}>ล้างรายการ</button>
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

function AdminCategories({ token, reloadStore, categories }) {
  const [list, setList] = useState([])
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { setList(await api('getCategories', { sessionToken: token })); setError('') }
    catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [token])

  const mains = list.filter(c => !c.ParentID)
  function subs(pid) { return list.filter(c => String(c.ParentID) === String(pid)) }

  async function save() {
    setBusy(true)
    try {
      await api('saveCategory', { sessionToken: token, category: draft })
      setDraft(null)
      await load()
      await reloadStore()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function remove(id) {
    if (!confirm('ลบหมวดหมู่?')) return
    try { await api('deleteCategory', { sessionToken: token, categoryId: id }); await load(); await reloadStore() }
    catch (e) { setError(e.message) }
  }

  function edit(cat) { setDraft({ ...cat }) }

  return <div>
    <div className="row-between"><h2>จัดการหมวดหมู่</h2>
      <div className="row-actions">
        <button className="primary compact" onClick={() => setDraft({ ParentID: '', Name: '', NameEn: '', NameZh: '', SortOrder: 0, IsActive: 'TRUE' })}>+ เพิ่มหมวดหลัก</button>
        <button className="secondary compact" onClick={() => setDraft({ ParentID: mains.length ? mains[0].CategoryID : '', Name: '', NameEn: '', NameZh: '', SortOrder: 0, IsActive: 'TRUE' })}>+ เพิ่มหมวดรอง</button>
      </div>
    </div>
    {error && <p className="hint error">{error}</p>}

    {draft && <div className="card">
      <Field label="ชื่อหมวดหมู่"><input value={draft.Name} onChange={e => setDraft({ ...draft, Name: e.target.value })} /></Field>
      <Field label="ชื่ออังกฤษ"><input value={draft.NameEn} onChange={e => setDraft({ ...draft, NameEn: e.target.value })} /></Field>
      <Field label="ชื่อจีน"><input value={draft.NameZh} onChange={e => setDraft({ ...draft, NameZh: e.target.value })} /></Field>
      <Field label="หมวดหลัก">
        <select value={draft.ParentID || ''} onChange={e => setDraft({ ...draft, ParentID: e.target.value })}>
          <option value="">-- หมวดหลัก (ไม่มีหมวดแม่) --</option>
          {mains.filter(m => String(m.CategoryID) !== String(draft.CategoryID)).map(m => <option key={m.CategoryID} value={m.CategoryID}>{m.Name}</option>)}
        </select>
      </Field>
      <Field label="ลำดับ"><input type="number" value={draft.SortOrder} onChange={e => setDraft({ ...draft, SortOrder: e.target.value })} /></Field>
      <label className="checkline"><input type="checkbox" checked={String(draft.IsActive).toUpperCase() !== 'FALSE'} onChange={e => setDraft({ ...draft, IsActive: e.target.checked ? 'TRUE' : 'FALSE' })} /><span>เปิดใช้งาน</span></label>
      <div className="row-actions"><button className="primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button><button className="ghost" onClick={() => setDraft(null)}>ยกเลิก</button></div>
    </div>}

    {mains.map(main => <div className="category-block" key={main.CategoryID}>
      <div className="category-head">
        <b>{main.Name}</b>
        <div className="row-actions">
          <button className="ghost compact" onClick={() => edit(main)}>แก้ไข</button>
          <button className="ghost compact" onClick={() => remove(main.CategoryID)}>ลบ</button>
        </div>
      </div>
      {subs(main.CategoryID).length > 0 && <div className="sub-list">
        {subs(main.CategoryID).map(sub => <div className="category-head sub" key={sub.CategoryID}>
          <span>└ {sub.Name}</span>
          <div className="row-actions">
            <button className="ghost compact" onClick={() => edit(sub)}>แก้ไข</button>
            <button className="ghost compact" onClick={() => remove(sub.CategoryID)}>ลบ</button>
          </div>
        </div>)}
      </div>}
    </div>)}
    {!list.length && !error && <p className="hint">ยังไม่มีหมวดหมู่ — กด "เพิ่มหมวดหลัก" เพื่อเริ่มต้น</p>}
  </div>
}
