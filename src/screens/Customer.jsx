import React, { useEffect, useState } from 'react'
import { api, baht, compressImage, deliveryFeeFor, distanceKm, fmtTime, num, promoOf, storeDirectionsUrl } from '../api'
import { ChatRoom, Empty, Field, MapPicker, Receipt, StatusBadge, StoreMap } from '../components'

export function MenuScreen({ menu, addItem, onLightbox, onProfile, user }) {
  return <section>
    <div className="hero">
      <p>ทอดใหม่ทุกออเดอร์</p>
      <h1>หิวเมื่อไร<br />ให้ DinoEater ดูแล</h1>
      <button onClick={onProfile}>{user ? `${user.Name} · ${num(user.Stamps)} แสตมป์` : 'เข้าสู่ระบบสมาชิก'}</button>
    </div>
    <div className="section-title"><h2>เมนูแนะนำ</h2><small>แตะรูปเพื่อดูเต็มจอ</small></div>
    <div className="menu-grid">
      {menu.map(item => <article className="food-card" key={item.ID}>
        <div className="food-image" onClick={() => onLightbox(item.ImageURL, item.Name)}>
          {item.ImageURL ? <img src={item.ImageURL} alt={item.Name} /> : '🍢'}
        </div>
        <div className="food-body">
          <h3>{item.Name}</h3>
          <p>{item.Description}</p>
          <div className="food-foot">
            <strong>{baht(item.Price)}</strong>
            <span className="stock">{String(item.Stock).toUpperCase() === 'UNLIMITED' ? 'มีจำหน่าย' : `เหลือ ${item.Stock}`}</span>
          </div>
          <button className="add" onClick={() => addItem(item)}>+</button>
        </div>
      </article>)}
      {!menu.length && <Empty text="ร้านยังไม่เพิ่มเมนู" />}
    </div>
  </section>
}

export function StoreScreen({ store, onProfile, user }) {
  const settings = store.settings || {}
  return <section className="page">
    <h1>ที่ตั้งร้าน</h1>
    <div className="profile-head">
      <span className="store-pin big">📍</span>
      <div>
        <b>{settings.StoreName || 'DinoEater'}</b>
        {settings.StoreAddress ? <small>{settings.StoreAddress}</small> : <small className="hint">ร้านยังไม่ระบุที่อยู่</small>}
        {settings.StorePhone && <small>โทร <a href={`tel:${settings.StorePhone}`}>{settings.StorePhone}</a></small>}
      </div>
    </div>
    <StoreMap settings={settings} />
    {!storeDirectionsUrl(settings) && <p className="hint">ร้านยังไม่ปักหมุดตำแหน่ง กรุณาติดต่อร้านโดยตรง</p>}
    <button className="ghost" onClick={onProfile}>{user ? 'บัญชีของฉัน' : 'เข้าสู่ระบบสมาชิก'}</button>
  </section>
}

export function CartScreen({ cart, updateQuantity, onCheckout, onContinue }) {
  const subtotal = cart.reduce((sum, item) => sum + num(item.Price) * item.quantity, 0)
  return <section className="page">
    <h1>ตะกร้าของคุณ</h1>
    {!cart.length ? <Empty text="ยังไม่มีรายการในตะกร้า" action="ดูเมนู" onAction={onContinue} /> : <>
      <div className="cart-list">
        {cart.map(item => <div className="cart-row" key={item.ID}>
          <div className="emoji">{item.ImageURL ? <img src={item.ImageURL} alt={item.Name} /> : '🍢'}</div>
          <div><b>{item.Name}</b><small>{baht(item.Price)}</small></div>
          <div className="stepper">
            <button onClick={() => updateQuantity(item.ID, item.quantity - 1)}>-</button>
            <span>{item.quantity}</span>
            <button onClick={() => updateQuantity(item.ID, item.quantity + 1)}>+</button>
          </div>
        </div>)}
      </div>
      <div className="total"><span>ค่าอาหาร</span><b>{baht(subtotal)}</b></div>
      <button className="primary" onClick={onCheckout}>ไปชำระเงิน</button>
    </>}
  </section>
}

export function CheckoutScreen({ cart, user, store, onOrderCreated, onStoreChange }) {
  const settings = store.settings || {}
  const [form, setForm] = useState({
    phone: user?.Phone || '',
    orderType: 'Pickup',
    paymentMethod: 'Cash',
    address: '',
    point: null,
    slip: '',
    redeem: false
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [member, setMember] = useState(user || null)
  const [checked, setChecked] = useState(false)
  const subtotal = cart.reduce((sum, item) => sum + num(item.Price) * item.quantity, 0)
  const distance = form.point ? distanceKm(settings, form.point) : 0
  const deliveryFee = form.orderType === 'Delivery' ? deliveryFeeFor(settings, subtotal, distance) : 0
  const promos = store.promotions || []

  async function checkPhone() {
    const phone = String(form.phone).trim()
    if (!phone) { setMember(null); setChecked(false); return }
    try {
      const data = await api('login', { phone })
      setMember(data.exists ? data : null)
      setChecked(true)
    } catch { setMember(null); setChecked(false) }
  }

  function freeItemValue(promo) {
    if (!promo || !promo.FreeMenuID) return 0
    const item = cart.find(row => String(row.ID) === String(promo.FreeMenuID))
    return item ? num(item.Price) : 0
  }
  const lines = []
  const memberPromo = promoOf(promos, 'NewMember')
  if ((user?.IsFirstOrder || (checked && member?.IsFirstOrder)) && memberPromo) lines.push({ label: `สมาชิกใหม่: ${memberPromo.PromoType}`, value: num(memberPromo.DiscountValue) + freeItemValue(memberPromo) })
  const bankPromo = promoOf(promos, 'MobileBanking')
  if (form.paymentMethod === 'Transfer' && bankPromo) lines.push({ label: 'ส่วนลดโอนเงิน', value: num(bankPromo.DiscountValue) + freeItemValue(bankPromo) })
  const reward = promoOf(promos, 'StampReward')
  const stampUser = user || member
  const canRedeem = !!stampUser && !!reward && num(stampUser.Stamps) >= num(reward.Condition)
  if (form.redeem && canRedeem) lines.push({ label: `แลก ${num(reward.Condition)} แสตมป์`, value: num(reward.DiscountValue) + freeItemValue(reward) })
  const discount = Math.min(subtotal + deliveryFee, lines.reduce((sum, line) => sum + line.value, 0))
  const total = Math.max(0, subtotal + deliveryFee - discount)

  async function submit() {
    setError('')
    const digits = String(form.phone).replace(/\D/g, '')
    if (digits && !/^0\d{8,9}$/.test(digits)) return setError('เบอร์โทรศัพท์ไม่ถูกต้อง หรือเว้นว่างเพื่อสั่งแบบไม่ระบุเบอร์')
    if (form.orderType === 'Delivery' && !form.address.trim()) return setError('กรุณาระบุที่อยู่จัดส่ง')
    if (form.paymentMethod === 'Transfer' && !form.slip) return setError('กรุณาอัปโหลดสลิปโอนเงิน')
    setBusy(true)
    try {
      const order = await api('createOrder', {
        order: {
          userId: user?.ID || '',
          phone: digits,
          orderType: form.orderType,
          addressDetail: form.address,
          lat: form.point?.lat || '',
          lng: form.point?.lng || '',
          distance,
          deliveryFee,
          paymentMethod: form.paymentMethod,
          subTotal: subtotal,
          discount,
          total,
          slipBase64: form.slip,
          estimatedTime: num(settings.PrepMinutes),
          redeemStamps: form.redeem && canRedeem
        },
        items: cart.map(item => ({ menuId: item.ID, quantity: item.quantity, price: item.Price }))
      })
      if (user) {
        try { const fresh = await api('login', { phone: digits || user.Phone }); if (fresh.exists) onStoreChange(null, fresh) } catch { /* ignore refresh */ }
      }
      onOrderCreated(order)
    } catch (submitError) { setError(submitError.message) } finally { setBusy(false) }
  }

  return <section className="page">
    <h1>ยืนยันการสั่งซื้อ</h1>
    <Field label="เบอร์โทรศัพท์ (ไม่บังคับ)" hint={member ? `สมาชิก: ${member.Name} · ${num(member.Stamps)} แสตมป์` : 'ไม่กรอกก็ได้ จะเป็นลูกค้าทั่วไป (สะสมแสตมป์ไม่ได้)'}>
      <input value={form.phone} inputMode="tel" onBlur={checkPhone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="08x-xxx-xxxx" />
    </Field>
    {checked && !member && <p className="hint">ยังไม่เป็นสมาชิก — หลังสั่งซื้อ ระบบจะให้ลงทะเบียนเพื่อสะสมแสตมป์ได้</p>}
    <div className="choice">
      <button className={form.orderType === 'Pickup' ? 'selected' : ''} onClick={() => setForm({ ...form, orderType: 'Pickup' })}>รับหน้าร้าน</button>
      <button className={form.orderType === 'Delivery' ? 'selected' : ''} onClick={() => setForm({ ...form, orderType: 'Delivery' })}>ให้ร้านไปส่ง</button>
    </div>
    {form.orderType === 'Delivery' && <>
      <Field label="รายละเอียดที่อยู่"><input value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder="บ้านเลขที่ / จุดสังเกต" /></Field>
      <MapPicker store={settings} value={form.point} onChange={point => setForm({ ...form, point })} />
      {!form.phone.trim() && <p className="hint">ยังไม่ให้เบอร์ติดต่อ — ร้านจะติดต่อกลับไม่ได้หากมีปัญหาในการส่ง</p>}
      <p className="hint">ค่าส่ง {num(settings.DeliveryFeePerKm)} บาท/กม. หลังจาก {num(settings.FreeDeliveryDistanceKm)} กม. แรก · สั่งครบ {baht(settings.FreeDeliveryMinimum)} ส่งฟรี</p>
    </>}
    <div className="choice">
      <button className={form.paymentMethod === 'Cash' ? 'selected' : ''} onClick={() => setForm({ ...form, paymentMethod: 'Cash' })}>เงินสด</button>
      <button className={form.paymentMethod === 'Transfer' ? 'selected' : ''} onClick={() => setForm({ ...form, paymentMethod: 'Transfer' })}>โอนเงิน</button>
    </div>
    {form.paymentMethod === 'Transfer' && <>
      {settings.StorePhone && <p className="hint">โอนไปที่ {settings.StoreName || 'ร้าน'} เบอร์ {settings.StorePhone}</p>}
      <Field label="สลิปโอนเงิน">
        <input type="file" accept="image/*" onChange={event => compressImage(event.target.files[0]).then(slip => setForm({ ...form, slip }))} />
      </Field>
      {form.slip && <img className="preview" src={form.slip} alt="slip" />}
    </>}
    {canRedeem && <label className="checkline"><input type="checkbox" checked={form.redeem} onChange={event => setForm({ ...form, redeem: event.target.checked })} /><span>ใช้ {num(reward.Condition)} แสตมป์แลกส่วนลด {baht(reward.DiscountValue)} (มี {num(stampUser.Stamps)} แสตมป์)</span></label>}
    <div className="cart-list">
      {cart.map(item => <div className="cart-row" key={item.ID}><div className="emoji">🍢</div><div><b>{item.Name}</b><small>{item.quantity} × {baht(item.Price)}</small></div><b>{baht(num(item.Price) * item.quantity)}</b></div>)}
    </div>
    <Receipt subtotal={subtotal} deliveryFee={deliveryFee} discount={discount} total={total} lines={lines} />
    {error && <p className="hint error">{error}</p>}
    <button className="primary" disabled={busy} onClick={submit}>{busy ? 'กำลังส่งออเดอร์...' : 'ยืนยันการสั่งซื้อ'}</button>
  </section>
}

export function ProfileScreen({ user, onUser, onBack, store, onReorder }) {
  const [phone, setPhone] = useState(user?.Phone || '')
  const [name, setName] = useState(user?.Name || '')
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [expanded, setExpanded] = useState('')
  const stampIcon = store.settings?.StampIcon

  useEffect(() => {
    if (!user) return
    api('getCustomerOrders', { phone: user.Phone }).then(setHistory).catch(() => setHistory([]))
  }, [user?.ID, user?.Phone])

  async function login() {
    setError('')
    const digits = String(phone).replace(/\D/g, '')
    if (!/^0\d{8,9}$/.test(digits)) return setError('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง')
    try {
      const data = await api('login', { phone: digits, name, register })
      if (data.exists === false) { setRegister(true); setError('ยังไม่มีบัญชีนี้ กรุณาสมัครสมาชิก'); return }
      onUser(data)
      onBack()
    } catch (loginError) { setError(loginError.message) }
  }
  async function saveProfile() {
    try { const data = await api('updateProfile', { phone: user.Phone, name }); onUser({ ...user, ...data }); setError('บันทึกแล้ว') } catch (profileError) { setError(profileError.message) }
  }
  async function savePicture(file) {
    try { const data = await api('updateProfile', { phone: user.Phone, profilePicBase64: await compressImage(file, 600, 0.8) }); onUser({ ...user, ...data }); setError('อัปเดตรูปแล้ว') } catch (pictureError) { setError(pictureError.message) }
  }
  function logout() { onUser(null); onBack() }

  if (!user) return <section className="page">
    <h1>{register ? 'สมัครสมาชิก DinoEater' : 'เข้าสู่ระบบสมาชิก'}</h1>
    <Field label="เบอร์โทรศัพท์"><input value={phone} inputMode="tel" onChange={event => setPhone(event.target.value)} placeholder="08x-xxx-xxxx" /></Field>
    {register && <Field label="ชื่อ (ไม่บังคับ)" hint="ชื่อจริงหรือชื่อเล่นก็ได้"><input value={name} onChange={event => setName(event.target.value)} placeholder="ชื่อของคุณ" /></Field>}
    {error && <p className="hint error">{error}</p>}
    <button className="primary" onClick={login}>{register ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button>
    <button className="ghost" onClick={() => { setRegister(!register); setError('') }}>{register ? 'มีบัญชีแล้ว เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครสมาชิก'}</button>
    <p className="hint">ใช้เบอร์โทรเข้าใช้งาน ไม่ต้องใช้ PIN · สะสมแสตมป์และดูประวัติการซื้อได้ทุกอุปกรณ์</p>
  </section>

  return <section className="page">
    <h1>บัญชีของฉัน</h1>
    <div className="profile-head">
      <img src={user.ProfilePic || ''} alt="" onError={event => { event.target.style.visibility = 'hidden' }} />
      <div>
        <b>{user.Name}</b>
        <small>{user.Phone}</small>
        <small>บทบาท: {user.Role}</small>
      </div>
    </div>
    <div className="stamp-card">
      {stampIcon ? <img src={stampIcon} alt="stamp" /> : <span className="stamp-emoji">⭐</span>}
      <div><b>{num(user.Stamps)} แสตมป์</b><small>ซื้อครบ {baht(store.settings?.StampSpendAmount)} = 1 แสตมป์</small></div>
    </div>
    <h2>ประวัติการซื้อ</h2>
    {!history.length && <p className="hint">ยังไม่มีประวัติการซื้อ</p>}
    {history.map(order => <article className="order-card" key={order.OrderID}>
      <div className="row-between"><b>{fmtTime(order.CreatedAt)}</b><StatusBadge status={order.Status} /></div>
      <small>ยอด {baht(order.Total)} · {(order.items || []).length} รายการ</small>
      <button className="ghost compact" onClick={() => setExpanded(expanded === order.OrderID ? '' : order.OrderID)}>{expanded === order.OrderID ? 'ซ่อนรายการ' : 'ดูรายการ'}</button>
      {expanded === order.OrderID && <>
        <div className="receipt">
          {(order.items || []).map(item => <div key={item.ID}><span>{menuName(store.menu, item.MenuID)} × {item.Quantity}</span><b>{baht(num(item.Price) * num(item.Quantity))}</b></div>)}
        </div>
        <button className="primary" onClick={() => onReorder(order)}>สั่งซื้ออีกครั้ง</button>
      </>}
    </article>)}
    <h2>ตั้งค่าโปรไฟล์</h2>
    <Field label="เปลี่ยนชื่อ"><input value={name} onChange={event => setName(event.target.value)} placeholder="ชื่อของคุณ" /></Field>
    <button className="secondary" onClick={saveProfile}>บันทึกชื่อ</button>
    <Field label="รูปโปรไฟล์"><input type="file" accept="image/*" onChange={event => savePicture(event.target.files[0])} /></Field>
    {error && <p className="hint">{error}</p>}
    <button className="ghost" onClick={logout}>ออกจากระบบ</button>
  </section>
}

function menuName(menu, menuId) {
  const item = (menu || []).find(row => String(row.ID) === String(menuId))
  return item ? item.Name : menuId
}

function RegisterAfterOrder({ order, onRegistered }) {
  const [phone, setPhone] = useState(order.Phone ? String(order.Phone) : '')
  const [name, setName] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError('')
    const digits = String(phone).replace(/\D/g, '')
    if (!/^0\d{8,9}$/.test(digits)) return setError('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง')
    setBusy(true)
    try {
      const registered = await api('login', { phone: digits, register: true, name })
      setDone(true)
      onRegistered(registered)
    } catch (registerError) { setError(registerError.message) } finally { setBusy(false) }
  }

  if (done) return <div className="card"><b>ลงทะเบียนสำเร็จ 🎉</b><p className="hint">ดูแสตมป์และประวัติการซื้อได้ที่เมนู "บัญชี"</p></div>
  return <div className="card">
    <b>ยังไม่เป็นสมาชิก?</b>
    <p className="hint">ลงทะเบียนเพื่อสะสมแสตมป์และดูประวัติการซื้อ (กรอกแค่เบอร์ และชื่อถ้าต้องการ)</p>
    <Field label="เบอร์โทรศัพท์"><input value={phone} inputMode="tel" onChange={event => setPhone(event.target.value)} placeholder="08x-xxx-xxxx" /></Field>
    <Field label="ชื่อ (ไม่บังคับ)"><input value={name} onChange={event => setName(event.target.value)} placeholder="ชื่อจริงหรือชื่อเล่น" /></Field>
    {error && <p className="hint error">{error}</p>}
    <button className="primary" disabled={busy} onClick={submit}>{busy ? 'กำลังลงทะเบียน...' : 'ลงทะเบียน'}</button>
  </div>
}

export function OrderStatusScreen({ order, store, user, onOpenChat, chatOpen, chat, onChat, onSend, onResolve, onMenu, onRegistered }) {
  if (!order) return <section className="page"><Empty text="ยังไม่มีออเดอร์ล่าสุด" action="สั่งอาหาร" onAction={onMenu} /></section>
  const settings = store.settings || {}
  const steps = ['Pending', 'Accepted', 'Ready', 'Completed']
  const currentStep = steps.indexOf(order.Status)
  const readyAt = order.CreatedAt && order.EstimatedTime ? new Date(new Date(order.CreatedAt).getTime() + num(order.EstimatedTime) * 60000) : null
  const disputeMinutes = num(settings.DisputeMinutes)
  const canReport = order.Status === 'Completed' && order.CompletedAt && disputeMinutes > 0 && (new Date().getTime() - new Date(order.CompletedAt).getTime()) / 60000 <= disputeMinutes

  return <section className="page status">
    <div className="status-icon">{order.Status === 'Completed' ? '✅' : '🍳'}</div>
    <h1>{order.Status === 'Completed' ? 'ออเดอร์เสร็จสิ้น' : 'ร้านได้รับออเดอร์แล้ว'}</h1>
    <p>หมายเลข <b>{order.OrderID}</b></p>
    <StatusBadge status={order.Status} />
    <div className="timeline">
      {steps.map((step, index) => <div key={step} className={`timeline-step ${index <= currentStep ? 'done' : ''}`}>
        <span className="dot" /><small>{['รับออเดอร์', 'กำลังทำ', 'พร้อมรับ/ส่ง', 'เสร็จสิ้น'][index]}</small>
      </div>)}
    </div>
    <p className="hint">เวลาทำอาหารประมาณ {num(order.EstimatedTime)} นาที{readyAt ? ` · พร้อมประมาณ ${readyAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
    {order.Status === 'Completed' && <p>{settings.ThankYouMessage}</p>}
    <div className="receipt">
      {(order.items || []).map(item => <div key={item.ID}><span>{item.MenuID} × {item.Quantity}</span><b>{baht(num(item.Price) * num(item.Quantity))}</b></div>)}
      <div><span>ค่าอาหาร</span><b>{baht(order.SubTotal)}</b></div>
      {num(order.DeliveryFee) > 0 && <div><span>ค่าจัดส่ง</span><b>{baht(order.DeliveryFee)}</b></div>}
      {num(order.Discount) > 0 && <div className="discount-line"><span>ส่วนลด</span><b>-{baht(order.Discount)}</b></div>}
      <div className="grand"><span>ยอดสุทธิ</span><b>{baht(order.Total)}</b></div>
    </div>
    {order.SlipURL && <p className="hint">สลิปที่แนบ: <a href={order.SlipURL} target="_blank" rel="noreferrer">ดูสลิป</a></p>}
    {order.OrderType === 'Pickup' && storeDirectionsUrl(settings) && <button className="secondary" onClick={() => window.open(storeDirectionsUrl(settings), '_blank')}>🧭 นำทางไปรับที่ร้าน</button>}
    {canReport && !chatOpen && <button className="secondary" onClick={() => onOpenChat(order, 'รายงานปัญหา: ')}>⚠️ รายงานปัญหา (ภายใน {disputeMinutes} นาที)</button>}
    {!order.UserID && !user && <RegisterAfterOrder order={order} onRegistered={onRegistered} />}
    {chatOpen && <ChatRoom chat={chat} send={onSend} phone={user?.Phone || order.Phone} onResolve={onResolve} canResolve={false} />}
    {!chatOpen && <button className="primary" onClick={onMenu}>กลับสู่เมนู</button>}
  </section>
}
