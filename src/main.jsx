import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const baht = value => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value || 0)
const sampleMenu = [
  { ID: 'M001', Name: 'ลูกชิ้นทอดรวม', Description: 'ลูกชิ้นทอดกรอบ เสิร์ฟพร้อมน้ำจิ้มสูตรร้าน', Price: 45, ImageURL: '', Stock: 'Unlimited', IsActive: 'TRUE' },
  { ID: 'M002', Name: 'เกี๊ยวทอด', Description: 'เกี๊ยวหมูทอดกรอบ 6 ชิ้น', Price: 39, ImageURL: '', Stock: 'Unlimited', IsActive: 'TRUE' },
  { ID: 'M003', Name: 'ไส้กรอกแดงทอด', Description: 'ไส้กรอกแดงทอดร้อน ๆ', Price: 30, ImageURL: '', Stock: 'Unlimited', IsActive: 'TRUE' }
]
const defaults = { StoreName: 'DinoEater', PrepMinutes: 10, DisputeMinutes: 10, FreeDeliveryDistanceKm: 2, DeliveryFeePerKm: 5, FreeDeliveryMinimum: 200, StampSpendAmount: 50, ThankYouMessage: 'ขอบคุณที่ใช้บริการ DinoEater' }

async function api(action, data = {}) {
  if (!API_URL) throw new Error('ยังไม่ได้ตั้งค่า VITE_API_URL')
  const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, ...data }) })
  const json = await response.json()
  if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด')
  return json.data
}

function App() {
  const [screen, setScreen] = useState('menu')
  const [menu, setMenu] = useState(sampleMenu)
  const [settings, setSettings] = useState(defaults)
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem('dino-cart') || '[]'))
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('dino-user') || 'null'))
  const [notice, setNotice] = useState('')
  const [activeOrder, setActiveOrder] = useState(null)

  useEffect(() => { navigator.serviceWorker?.register(import.meta.env.BASE_URL + 'sw.js'); loadStore() }, [])
  useEffect(() => localStorage.setItem('dino-cart', JSON.stringify(cart)), [cart])
  useEffect(() => { if (user) localStorage.setItem('dino-user', JSON.stringify(user)) }, [user])
  useEffect(() => {
    if (!activeOrder?.OrderID) return
    const timer = setInterval(async () => { try { setActiveOrder(await api('getOrder', { orderId: activeOrder.OrderID })) } catch {} }, 12000)
    return () => clearInterval(timer)
  }, [activeOrder?.OrderID])

  async function loadStore() {
    if (!API_URL) return
    try { const data = await api('getStore'); setMenu(data.menu || []); setSettings({ ...defaults, ...data.settings }) } catch (error) { setNotice(error.message) }
  }
  function addItem(item) { setCart(current => { const found = current.find(row => row.ID === item.ID); return found ? current.map(row => row.ID === item.ID ? { ...row, quantity: row.quantity + 1 } : row) : [...current, { ...item, quantity: 1 }] }) }
  function updateQuantity(id, quantity) { setCart(current => quantity < 1 ? current.filter(row => row.ID !== id) : current.map(row => row.ID === id ? { ...row, quantity } : row)) }
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)

  return <main className="app-shell">
    <header><button className="brand" onClick={() => setScreen('menu')}>DINO<span>EATER</span></button><button className="cart-button" onClick={() => setScreen('cart')}>ตะกร้า <b>{cartCount}</b></button></header>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>x</button></div>}
    {screen === 'menu' && <Menu menu={menu} addItem={addItem} onProfile={() => setScreen('profile')} />}
    {screen === 'cart' && <Cart cart={cart} updateQuantity={updateQuantity} onCheckout={() => setScreen('checkout')} onContinue={() => setScreen('menu')} />}
    {screen === 'checkout' && <Checkout cart={cart} user={user} settings={settings} onLogin={setUser} onDone={order => { setCart([]); setActiveOrder(order); setScreen('order') }} />}
    {screen === 'profile' && <Profile user={user} onUser={setUser} onBack={() => setScreen('menu')} />}
    {screen === 'order' && <OrderStatus order={activeOrder} message={settings.ThankYouMessage} onMenu={() => setScreen('menu')} />}
    <nav><button onClick={() => setScreen('menu')}>เมนู</button><button onClick={() => setScreen('order')}>ออเดอร์</button><button onClick={() => setScreen('profile')}>บัญชี</button><button onClick={() => setScreen('admin')}>ร้านค้า</button></nav>
    {screen === 'admin' && <Admin settings={settings} onSettings={setSettings} />}
  </main>
}

function Menu({ menu, addItem, onProfile }) { return <section><div className="hero"><p>ทอดใหม่ทุกออเดอร์</p><h1>หิวเมื่อไร<br />ให้ DinoEater ดูแล</h1><button onClick={onProfile}>เข้าสู่ระบบสมาชิก</button></div><div className="section-title"><h2>เมนูแนะนำ</h2><small>แตะ + เพื่อเพิ่ม</small></div><div className="menu-grid">{menu.filter(item => String(item.IsActive).toUpperCase() !== 'FALSE').map(item => <article className="food-card" key={item.ID}><div className="food-image">{item.ImageURL ? <img src={item.ImageURL} alt={item.Name} /> : '🍢'}</div><div><h3>{item.Name}</h3><p>{item.Description}</p><strong>{baht(Number(item.Price))}</strong><button className="add" onClick={() => addItem(item)}>+</button></div></article>)}</div></section> }
function Cart({ cart, updateQuantity, onCheckout, onContinue }) { const total = cart.reduce((sum, item) => sum + Number(item.Price) * item.quantity, 0); return <section className="page"><h1>ตะกร้าของคุณ</h1>{!cart.length ? <Empty text="ยังไม่มีรายการในตะกร้า" action="ดูเมนู" onAction={onContinue} /> : <><div className="cart-list">{cart.map(item => <div className="cart-row" key={item.ID}><div className="emoji">🍢</div><div><b>{item.Name}</b><small>{baht(item.Price)}</small></div><div className="stepper"><button onClick={() => updateQuantity(item.ID, item.quantity - 1)}>-</button>{item.quantity}<button onClick={() => updateQuantity(item.ID, item.quantity + 1)}>+</button></div></div>)}</div><div className="total"><span>ค่าอาหาร</span><b>{baht(total)}</b></div><button className="primary" onClick={onCheckout}>ไปชำระเงิน</button></>}</section> }
function Checkout({ cart, user, settings, onLogin, onDone }) {
  const [form, setForm] = useState({ phone: user?.Phone || '', orderType: 'Pickup', paymentMethod: 'Cash', address: '', distance: 0, slip: '' }); const [busy, setBusy] = useState(false)
  const subtotal = cart.reduce((sum, item) => sum + Number(item.Price) * item.quantity, 0); const delivery = form.orderType === 'Delivery' && subtotal < Number(settings.FreeDeliveryMinimum) ? Math.max(0, Math.ceil(form.distance - Number(settings.FreeDeliveryDistanceKm))) * Number(settings.DeliveryFeePerKm) : 0
  const discount = form.paymentMethod === 'Transfer' ? Number(settings.MobileBankingDiscount || 0) : 0; const total = Math.max(0, subtotal + delivery - discount)
  async function submit() { if (!form.phone) return alert('กรุณากรอกเบอร์โทรศัพท์'); if (form.orderType === 'Delivery' && !form.address) return alert('กรุณาระบุที่อยู่จัดส่ง'); if (form.paymentMethod === 'Transfer' && !form.slip) return alert('กรุณาอัปโหลดสลิป'); setBusy(true); try { const data = await api('createOrder', { order: { userId: user?.ID || '', phone: form.phone, orderType: form.orderType, addressDetail: form.address, distance: form.distance, deliveryFee: delivery, paymentMethod: form.paymentMethod, subTotal: subtotal, discount, total, slipBase64: form.slip, estimatedTime: settings.PrepMinutes }, items: cart.map(item => ({ menuId: item.ID, quantity: item.quantity, price: item.Price })) }); onLogin(user || { Phone: form.phone, Role: 'Customer' }); onDone(data) } catch (error) { alert(error.message) } finally { setBusy(false) } }
  return <section className="page"><h1>ยืนยันการสั่งซื้อ</h1><label>เบอร์โทรศัพท์<input value={form.phone} inputMode="tel" onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="08x-xxx-xxxx" /></label><div className="choice"><button className={form.orderType === 'Pickup' ? 'selected' : ''} onClick={() => setForm({ ...form, orderType: 'Pickup' })}>รับหน้าร้าน</button><button className={form.orderType === 'Delivery' ? 'selected' : ''} onClick={() => setForm({ ...form, orderType: 'Delivery' })}>ให้ร้านไปส่ง</button></div>{form.orderType === 'Delivery' && <><label>รายละเอียดที่อยู่<input onChange={e => setForm({ ...form, address: e.target.value })} placeholder="บ้านเลขที่ / จุดสังเกต" /></label><label>ระยะทาง (กม.)<input type="number" min="0" step="0.1" onChange={e => setForm({ ...form, distance: Number(e.target.value) })} /></label><p className="hint">เชื่อม Google Maps API แล้วจะคำนวณระยะทางจากหมุดอัตโนมัติ</p></>}<div className="choice"><button className={form.paymentMethod === 'Cash' ? 'selected' : ''} onClick={() => setForm({ ...form, paymentMethod: 'Cash' })}>เงินสด</button><button className={form.paymentMethod === 'Transfer' ? 'selected' : ''} onClick={() => setForm({ ...form, paymentMethod: 'Transfer' })}>โอนเงิน</button></div>{form.paymentMethod === 'Transfer' && <label>สลิปโอนเงิน<input type="file" accept="image/*" onChange={e => compressImage(e.target.files[0]).then(slip => setForm({ ...form, slip }))} /></label>}<div className="receipt"><div><span>ค่าอาหาร</span><b>{baht(subtotal)}</b></div><div><span>ค่าจัดส่ง</span><b>{baht(delivery)}</b></div>{discount > 0 && <div><span>ส่วนลด</span><b>-{baht(discount)}</b></div>}<div className="grand"><span>ยอดสุทธิ</span><b>{baht(total)}</b></div></div><button className="primary" disabled={busy} onClick={submit}>{busy ? 'กำลังส่งออเดอร์...' : 'ยืนยันการสั่งซื้อ'}</button></section>
}
function Profile({ user, onUser, onBack }) { const [phone, setPhone] = useState(user?.Phone || ''); const [pin, setPin] = useState(''); const [name, setName] = useState(user?.Name || ''); async function login() { try { const data = await api('login', { phone, pin, name }); onUser(data); onBack() } catch (error) { alert(error.message) } } return <section className="page"><h1>{user ? 'บัญชีของฉัน' : 'สมาชิก DinoEater'}</h1><label>เบอร์โทรศัพท์<input value={phone} onChange={e => setPhone(e.target.value)} /></label><label>ชื่อที่แสดง<input value={name} onChange={e => setName(e.target.value)} /></label><label>PIN 4-6 หลัก<input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} /></label><p className="hint">สำหรับสมาชิกใหม่ ระบบจะสร้างบัญชีจากเบอร์โทรและ PIN นี้</p><button className="primary" onClick={login}>{user ? 'บันทึกข้อมูล' : 'เข้าสู่ระบบ / สมัครสมาชิก'}</button></section> }
function OrderStatus({ order, message, onMenu }) { if (!order) return <section className="page"><Empty text="ยังไม่มีออเดอร์ล่าสุด" action="สั่งอาหาร" onAction={onMenu} /></section>; return <section className="page status"><div className="status-icon">🍳</div><h1>{order.Status === 'Completed' ? 'ส่งออเดอร์สำเร็จ' : 'ร้านได้รับออเดอร์แล้ว'}</h1><p>หมายเลข <b>{order.OrderID}</b></p><p>สถานะ: <b>{order.Status || 'Pending'}</b></p><p>เวลาประมาณ {order.EstimatedTime || 10} นาที</p>{order.Status === 'Completed' && <p>{message}</p>}<button className="primary" onClick={onMenu}>กลับสู่เมนู</button></section> }
function Admin({ settings, onSettings }) { const [orders, setOrders] = useState([]); const [error, setError] = useState(''); const [user] = useState(() => JSON.parse(localStorage.getItem('dino-user') || 'null')); const isAdmin = ['Admin', 'SuperAdmin'].includes(user?.Role); useEffect(() => { if (!isAdmin) return; let timer; async function load() { try { setOrders(await api('getOrders', { sessionToken: user.SessionToken })); setError('') } catch (e) { setError(e.message) } } load(); timer = setInterval(load, 12000); return () => clearInterval(timer) }, [isAdmin, user?.SessionToken]); async function update(orderId, status) { try { await api('updateOrderStatus', { orderId, status, sessionToken: user.SessionToken }); setOrders(rows => rows.map(row => row.OrderID === orderId ? { ...row, Status: status } : row)) } catch (e) { alert(e.message) } } if (!isAdmin) return <section className="page"><h1>สำหรับผู้ดูแลร้าน</h1><p className="hint">กรุณาเข้าสู่ระบบด้วยบัญชีที่มีบทบาท Admin หรือ SuperAdmin ก่อนใช้งาน</p></section>; return <section className="page admin"><h1>หน้าร้าน</h1>{error && <p className="hint">{error}</p>}<h2>ออเดอร์ล่าสุด</h2>{orders.map(order => <article className="order-card" key={order.OrderID}><b>{order.OrderID}</b><span>{order.OrderType} · {baht(order.Total)}</span><small>{order.Status}</small><div>{order.Status === 'Pending' && <button onClick={() => update(order.OrderID, 'Accepted')}>รับออเดอร์</button>}{order.Status === 'Accepted' && <button onClick={() => update(order.OrderID, 'Ready')}>อาหารพร้อม</button>}{order.Status === 'Ready' && <button onClick={() => update(order.OrderID, 'Completed')}>เสร็จสิ้น</button>}</div></article>)}{!orders.length && <p className="hint">ยังไม่มีออเดอร์</p>}<h2>ตั้งค่าร้าน</h2><label>เวลาทำอาหาร (นาที)<input type="number" value={settings.PrepMinutes} onChange={e => onSettings({ ...settings, PrepMinutes: e.target.value })} /></label><button className="primary" onClick={async () => { try { await api('saveSettings', { settings, sessionToken: user.SessionToken }); alert('บันทึกการตั้งค่าแล้ว') } catch (e) { alert(e.message) } }}>บันทึกการตั้งค่า</button></section> }
function Empty({ text, action, onAction }) { return <div className="empty"><p>{text}</p><button className="primary" onClick={onAction}>{action}</button></div> }
function compressImage(file) { return new Promise((resolve, reject) => { if (!file) return resolve(''); const reader = new FileReader(); reader.onload = () => { const image = new Image(); image.onload = () => { const size = Math.min(1280, image.width); const height = Math.round(image.height * size / image.width); const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = height; canvas.getContext('2d').drawImage(image, 0, 0, size, height); resolve(canvas.toDataURL('image/jpeg', .8)) }; image.onerror = reject; image.src = reader.result }; reader.onerror = reject; reader.readAsDataURL(file) }) }
createRoot(document.getElementById('root')).render(<App />)
