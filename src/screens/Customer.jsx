import React, { useEffect, useState } from 'react'
import { api, baht, compressImage, deliveryFeeFor, distanceKm, driveImage, fmtTime, isNewItem, num, orderOptions, promoOf, readCache, storeDirectionsUrl, writeCache } from '../api'
import { ChatRoom, Empty, Field, MapPicker, QueueTimer, Receipt, StatusBadge, StoreMap } from '../components'
import { t, useLang } from '../i18n'

function stockStatus(item) {
  if (item.StockStatus === 'SoldOutDaily') return { label: 'หมดวันนี้', cls: 'soldout-daily' }
  if (item.StockStatus === 'SoldOutPermanent') return { label: 'หมดไม่มีกำหนด', cls: 'soldout-permanent' }
  if (item.StockStatus === 'Hidden') return { label: 'ซ่อน', cls: 'hidden' }
  return null
}
function canAdd(item) { return !stockStatus(item) }
function StockBadge({ item }) {
  const s = stockStatus(item)
  if (!s) return null
  return <span className={`stock-badge ${s.cls}`}>{s.label}</span>
}

export function MenuScreen({ store, menu, popular = [], addItem, onLightbox, onProfile, user }) {
  useLang()
  const gallery = menu.filter(item => item.ImageURL).map(item => ({ ID: item.ID, id: item.ID, src: driveImage(item.ImageURL, 1600), title: item.Name }))
  const openLightbox = item => { const index = gallery.findIndex(row => String(row.ID) === String(item.ID)); if (index >= 0) onLightbox(gallery, index) }
  const logo = store?.settings?.StoreLogo ? driveImage(store.settings.StoreLogo, 400) : ''
  const categories = store.categories || []
  const catMap = {}
  categories.forEach(c => { catMap[c.CategoryID] = c })
  const grouped = {}
  menu.forEach(item => {
    const catId = item.CategoryID || '__none__'
    if (!grouped[catId]) grouped[catId] = []
    grouped[catId].push(item)
  })
  const catOrder = categories.filter(c => !c.ParentID).sort((a, b) => num(a.SortOrder) - num(b.SortOrder))
  return <section>
    <div className="hero">
      {logo && <img className="hero-logo" src={logo} alt="logo" onClick={onProfile} />}
      <p>{t('ทอดใหม่ทุกออเดอร์')}</p>
      <h1>{t('หิวเมื่อไร')}<br />{t('ให้ DinoEater ดูแล')}</h1>
      <button onClick={onProfile}>{user ? `${user.Name} · ${num(user.Stamps)} ${t('แสตมป์')}` : t('เข้าสู่ระบบสมาชิก')}</button>
    </div>
    {popular.length > 0 && <>
      <div className="section-title"><h2>{t('สินค้าขายดี')}</h2><small>{t('อันดับขายดีจากออเดอร์จริง')}</small></div>
      <div className="popular-row">
        {popular.map((item, index) => <article className="popular-card" key={item.ID}>
          <span className={`popular-rank${index === 0 ? ' top' : ''}`}>#{index + 1}</span>
          {isNewItem(item) && <span className="new-badge">New · อยากให้ลอง</span>}
          <StockBadge item={item} />
          <div className={`popular-image${item.ImageURL ? ' zoomable' : ''}`} onClick={() => openLightbox(item)}>
            {item.ImageURL ? <img src={driveImage(item.ImageURL, 400)} alt={item.Name} loading="lazy" /> : '🍢'}
          </div>
          <div className="popular-body">
            <h3>{item.Name}</h3>
            <small className="popular-sold">ขายแล้ว {num(item.Sold)} ชิ้น</small>
            <div className="popular-foot">
              <strong>{baht(item.Price)}</strong>
              {canAdd(item)
                ? <button className="add" onClick={() => addItem(item)}>+</button>
                : <span className="add disabled">×</span>}
            </div>
          </div>
        </article>)}
      </div>
    </>}
    {catOrder.map(main => {
      const subCats = categories.filter(c => String(c.ParentID) === String(main.CategoryID)).sort((a, b) => num(a.SortOrder) - num(b.SortOrder))
      const mainItems = grouped[main.CategoryID] || []
      const subGrouped = {}
      subCats.forEach(sub => { const items = grouped[sub.CategoryID] || []; if (items.length) subGrouped[sub.CategoryID] = items })
      const subItems = Object.values(subGrouped).flat()
      if (!mainItems.length && !subItems.length && main.CategoryID !== '__none__') return null
      return <div key={main.CategoryID}>
        <div className="section-title"><h2>{main.Name}</h2></div>
        <div className="menu-grid">
          {mainItems.map(item => <article className="food-card" key={item.ID}>
            {isNewItem(item) && <span className="new-badge">New · อยากให้ลอง</span>}
            <StockBadge item={item} />
            <div className={`food-image${item.ImageURL ? ' zoomable' : ''}`} onClick={() => openLightbox(item)}>
              {item.ImageURL ? <img src={driveImage(item.ImageURL, 600)} alt={item.Name} loading="lazy" /> : '🍢'}
            </div>
            <div className="food-body">
              <h3>{item.Name}</h3>
              <p>{item.Description}</p>
              <div className="food-foot">
                <strong>{baht(item.Price)}</strong>
                {stockStatus(item)
                  ? <span className={`stock-badge ${stockStatus(item).cls}`}>{stockStatus(item).label}</span>
                  : <span className="stock">{String(item.Stock).toUpperCase() === 'UNLIMITED' ? 'มีจำหน่าย' : `เหลือ ${item.Stock}`}</span>}
              </div>
              {canAdd(item)
                ? <button className="add" onClick={() => addItem(item)}>+</button>
                : <span className="add disabled">×</span>}
            </div>
          </article>)}
        </div>
        {subCats.map(sub => {
          const subItemsList = grouped[sub.CategoryID] || []
          if (!subItemsList.length) return null
          return <div key={sub.CategoryID}>
            <div className="section-title sub"><h3>{sub.Name}</h3></div>
            <div className="menu-grid">
              {subItemsList.map(item => <article className="food-card" key={item.ID}>
                  {isNewItem(item) && <span className="new-badge">New · อยากให้ลอง</span>}
                  <StockBadge item={item} />
                  <div className={`food-image${item.ImageURL ? ' zoomable' : ''}`} onClick={() => openLightbox(item)}>
                    {item.ImageURL ? <img src={driveImage(item.ImageURL, 600)} alt={item.Name} loading="lazy" /> : '🍢'}
                  </div>
                  <div className="food-body">
                    <h3>{item.Name}</h3>
                    <p>{item.Description}</p>
                    <div className="food-foot">
                      <strong>{baht(item.Price)}</strong>
                      {stockStatus(item)
                        ? <span className={`stock-badge ${stockStatus(item).cls}`}>{stockStatus(item).label}</span>
                        : <span className="stock">{String(item.Stock).toUpperCase() === 'UNLIMITED' ? 'มีจำหน่าย' : `เหลือ ${item.Stock}`}</span>}
                    </div>
                    {canAdd(item)
                      ? <button className="add" onClick={() => addItem(item)}>+</button>
                      : <span className="add disabled">×</span>}
                  </div>
                </article>)}
            </div>
          </div>
        })}
      </div>
    })}
    {grouped['__none__'] && grouped['__none__'].length > 0 && <div>
      <div className="section-title"><h2>อื่นๆ</h2></div>
      <div className="menu-grid">
        {grouped['__none__'].map(item => <article className="food-card" key={item.ID}>
          {isNewItem(item) && <span className="new-badge">New · อยากให้ลอง</span>}
          <StockBadge item={item} />
          <div className={`food-image${item.ImageURL ? ' zoomable' : ''}`} onClick={() => openLightbox(item)}>
            {item.ImageURL ? <img src={driveImage(item.ImageURL, 600)} alt={item.Name} loading="lazy" /> : '🍢'}
          </div>
          <div className="food-body">
            <h3>{item.Name}</h3>
            <p>{item.Description}</p>
            <div className="food-foot">
              <strong>{baht(item.Price)}</strong>
              {stockStatus(item)
                ? <span className={`stock-badge ${stockStatus(item).cls}`}>{stockStatus(item).label}</span>
                : <span className="stock">{String(item.Stock).toUpperCase() === 'UNLIMITED' ? 'มีจำหน่าย' : `เหลือ ${item.Stock}`}</span>}
            </div>
            {canAdd(item)
              ? <button className="add" onClick={() => addItem(item)}>+</button>
              : <span className="add disabled">×</span>}
          </div>
        </article>)}
      </div>
    </div>}
    {!menu.length && <Empty text="ร้านยังไม่เพิ่มเมนู" />}
  </section>
}

export function StoreScreen({ store, onProfile, user }) {
  const settings = store.settings || {}
  const logo = settings.StoreLogo ? driveImage(settings.StoreLogo, 400) : ''
  return <section className="page">
    <h1>ที่ตั้งร้าน</h1>
    <div className="profile-head">
      {logo ? <img className="store-logo" src={logo} alt="logo" /> : <span className="store-pin big">📍</span>}
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
          <div className="emoji">{item.ImageURL ? <img src={driveImage(item.ImageURL, 200)} alt={item.Name} /> : '🍢'}</div>
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
    address: user?.Address || '',
    point: user?.Lat && user?.Lng ? { lat: num(user.Lat), lng: num(user.Lng) } : null,
    slip: '',
    redeem: false
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [member, setMember] = useState(user || null)
  const [checked, setChecked] = useState(false)
  const optionGroups = store.options || []
  const [selection, setSelection] = useState({})
  const [showOptions, setShowOptions] = useState(false)
  const [optionError, setOptionError] = useState('')
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
      if (data.exists) {
        setForm(current => ({
          ...current,
          address: current.address || data.Address || '',
          point: current.point || (data.Lat && data.Lng ? { lat: num(data.Lat), lng: num(data.Lng) } : null)
        }))
      }
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

  function validationError() {
    const digits = String(form.phone).replace(/\D/g, '')
    if (digits && !/^0\d{8,9}$/.test(digits)) return 'เบอร์โทรศัพท์ไม่ถูกต้อง หรือเว้นว่างเพื่อสั่งแบบไม่ระบุเบอร์'
    if (form.orderType === 'Delivery' && !form.address.trim()) return 'กรุณาระบุที่อยู่จัดส่ง'
    if (form.paymentMethod === 'Transfer' && !form.slip) return 'กรุณาอัปโหลดสลิปโอนเงิน'
    return ''
  }
  function toggleOption(group, label) {
    setOptionError('')
    setSelection(current => {
      const picked = current[group.GroupID] || []
      if (group.MultiSelect) return { ...current, [group.GroupID]: picked.includes(label) ? picked.filter(item => item !== label) : picked.concat(label) }
      return { ...current, [group.GroupID]: picked.includes(label) ? [] : [label] }
    })
  }
  function selectedOptions() {
    return optionGroups
      .map(group => ({ groupId: group.GroupID, groupName: group.Name, choices: selection[group.GroupID] || [] }))
      .filter(group => group.choices.length)
  }
  function onConfirm() {
    const problem = validationError()
    if (problem) return setError(problem)
    setError('')
    if (optionGroups.length) { setOptionError(''); setShowOptions(true); return }
    doSubmit()
  }
  function confirmOptions() {
    const missing = optionGroups.filter(group => group.Required && !(selection[group.GroupID] || []).length)
    if (missing.length) return setOptionError(`กรุณาเลือก: ${missing.map(group => group.Name).join(', ')}`)
    setOptionError('')
    doSubmit()
  }

  async function doSubmit() {
    setError('')
    setBusy(true)
    try {
      const order = await api('createOrder', {
        sessionToken: user?.SessionToken,
        order: {
          userId: user?.ID || '',
          phone: String(form.phone).replace(/\D/g, ''),
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
          redeemStamps: form.redeem && canRedeem,
          options: selectedOptions()
        },
        items: cart.map(item => ({ menuId: item.ID, quantity: item.quantity, price: item.Price }))
      })
      if (user) {
        try { const fresh = await api('login', { phone: String(form.phone).replace(/\D/g, '') || user.Phone }); if (fresh.exists) onStoreChange(null, fresh) } catch { /* ignore refresh */ }
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
    {optionGroups.length > 0 && <p className="hint">มีตัวเลือกเสริม {optionGroups.length} อย่าง จะให้เลือกในขั้นถัดไป</p>}
    <button className="primary" disabled={busy} onClick={onConfirm}>{busy ? 'กำลังส่งออเดอร์...' : 'ยืนยันการสั่งซื้อ'}</button>
    {showOptions && <div className="modal">
      <div className="modal-card">
        <h2>ตัวเลือกเสริม</h2>
        <p className="hint">เลือกตามที่ต้องการ แล้วกดยืนยันเพื่อส่งออเดอร์ให้ร้าน</p>
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
        {optionError && <p className="hint error">{optionError}</p>}
        <button className="primary" disabled={busy} onClick={confirmOptions}>{busy ? 'กำลังส่งออเดอร์...' : 'ยืนยันและส่งออเดอร์'}</button>
        <button className="ghost" onClick={() => setShowOptions(false)}>ย้อนกลับ</button>
      </div>
    </div>}
  </section>
}

export function ProfileScreen({ user, onUser, onBack, onAuthSuccess, store, onReorder, init }) {
  function finishAuth(data) {
    if (onAuthSuccess) onAuthSuccess(data)
    else { onUser(data); onBack() }
  }
  const [phone, setPhone] = useState(init?.phone || user?.Phone || '')
  const [name, setName] = useState(user?.Name || '')
  const [register, setRegister] = useState(false)
  const [step, setStep] = useState(init?.mode === 'pin' ? 'pin' : init?.mode === 'setup' ? 'setup' : 'phone')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [adminName, setAdminName] = useState(init?.name || '')
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [expanded, setExpanded] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const stampIcon = store.settings?.StampIcon
  const isAdminRole = user && (user.Role === 'Admin' || user.Role === 'SuperAdmin')

  useEffect(() => {
    if (!user) return
    const cached = readCache('orders:' + user.Phone)
    if (cached) setHistory(cached)
    api('getCustomerOrders', { phone: user.Phone, sessionToken: user?.SessionToken }).then(data => { writeCache('orders:' + user.Phone, data); setHistory(data) }).catch(() => { if (!cached) setHistory([]) })
  }, [user?.ID, user?.Phone])

  async function login() {
    setError('')
    const digits = String(phone).replace(/\D/g, '')
    if (!/^0\d{8,9}$/.test(digits)) return setError('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง')
    try {
      const data = await api('login', { phone: digits, name, register })
      if (data.exists === false) { setRegister(true); setError('ยังไม่มีบัญชีนี้ กรุณาสมัครสมาชิก'); return }
      if (data.needsPinSetup) { setAdminName(data.Name || ''); setPin(''); setConfirmPin(''); setStep('setup'); setError('บัญชีผู้ดูแล: กรุณาตั้งรหัส PIN สำหรับเข้าใช้งาน (จะใช้ทุกครั้งที่ล็อกอิน)'); return }
      if (data.requiresPin) { setAdminName(data.Name || ''); setPin(''); setStep('pin'); setError(''); return }
      finishAuth(data)
    } catch (loginError) { setError(loginError.message) }
  }
  async function submitPin() {
    setError('')
    const digits = String(phone).replace(/\D/g, '')
    if (!/^\d{4,8}$/.test(String(pin))) return setError('รหัส PIN ต้องเป็นตัวเลข 4-8 หลัก')
    try { const data = await api('login', { phone: digits, pin }); finishAuth(data) } catch (pinError) { setError(pinError.message) }
  }
  async function submitSetup() {
    setError('')
    const digits = String(phone).replace(/\D/g, '')
    if (!/^\d{4,8}$/.test(String(pin))) return setError('รหัส PIN ต้องเป็นตัวเลข 4-8 หลัก')
    if (pin !== confirmPin) return setError('รหัส PIN ทั้งสองครั้งไม่ตรงกัน')
    try { const data = await api('login', { phone: digits, pin }); finishAuth(data) } catch (setupError) { setError(setupError.message) }
  }
  async function changePin() {
    setError('')
    if (!/^\d{4,8}$/.test(String(newPin))) return setError('รหัส PIN ใหม่ต้องเป็นตัวเลข 4-8 หลัก')
    try { await api('updateProfile', { sessionToken: user?.SessionToken, phone: user.Phone, currentPin, newPin }); setCurrentPin(''); setNewPin(''); setError('เปลี่ยนรหัส PIN เรียบร้อย') } catch (pinError) { setError(pinError.message) }
  }
  async function saveProfile() {
    try { const data = await api('updateProfile', { sessionToken: user?.SessionToken, phone: user.Phone, name }); onUser({ ...user, ...data }); setError('บันทึกแล้ว') } catch (profileError) { setError(profileError.message) }
  }
  async function savePicture(file) {
    try { const data = await api('updateProfile', { sessionToken: user?.SessionToken, phone: user.Phone, profilePicBase64: await compressImage(file, 600, 0.8) }); onUser({ ...user, ...data }); setError('อัปเดตรูปแล้ว') } catch (pictureError) { setError(pictureError.message) }
  }
  function logout() { onUser(null); onBack() }

  if (!user && step === 'pin') return <section className="page">
    <h1>ยืนยันรหัส PIN ผู้ดูแล</h1>
    <p className="hint">{adminName ? `${adminName} · ` : ''}{phone}</p>
    <Field label="รหัส PIN"><input type="password" inputMode="numeric" value={pin} onChange={event => setPin(event.target.value)} placeholder="กรอก PIN 4-8 หลัก" /></Field>
    {error && <p className="hint error">{error}</p>}
    <button className="primary" onClick={submitPin}>เข้าใช้งาน</button>
    <button className="ghost" onClick={() => { setStep('phone'); setPin(''); setError('') }}>ย้อนกลับ</button>
  </section>

  if (!user && step === 'setup') return <section className="page">
    <h1>ตั้งรหัส PIN ผู้ดูแล</h1>
    <p className="hint">{adminName ? `${adminName} · ` : ''}{phone} — ครั้งแรกตั้งรหัสไว้ ครั้งต่อไปต้องกรอกทุกครั้ง</p>
    <Field label="ตั้งรหัส PIN ใหม่"><input type="password" inputMode="numeric" value={pin} onChange={event => setPin(event.target.value)} placeholder="ตัวเลข 4-8 หลัก" /></Field>
    <Field label="ยืนยันรหัส PIN"><input type="password" inputMode="numeric" value={confirmPin} onChange={event => setConfirmPin(event.target.value)} placeholder="กรอกอีกครั้ง" /></Field>
    {error && <p className="hint error">{error}</p>}
    <button className="primary" onClick={submitSetup}>บันทึกและเข้าใช้งาน</button>
    <button className="ghost" onClick={() => { setStep('phone'); setPin(''); setConfirmPin(''); setError('') }}>ย้อนกลับ</button>
  </section>

  if (!user) return <section className="page">
    <h1>{register ? 'สมัครสมาชิก DinoEater' : 'เข้าสู่ระบบสมาชิก'}</h1>
    <Field label="เบอร์โทรศัพท์"><input value={phone} inputMode="tel" onChange={event => setPhone(event.target.value)} placeholder="08x-xxx-xxxx" /></Field>
    {register && <Field label="ชื่อ (ไม่บังคับ)" hint="ชื่อจริงหรือชื่อเล่นก็ได้"><input value={name} onChange={event => setName(event.target.value)} placeholder="ชื่อของคุณ" /></Field>}
    {error && <p className="hint error">{error}</p>}
    <button className="primary" onClick={login}>{register ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button>
    <button className="ghost" onClick={() => { setRegister(!register); setError('') }}>{register ? 'มีบัญชีแล้ว เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครสมาชิก'}</button>
    <p className="hint">ลูกค้าใช้แค่เบอร์โทร · บัญชีผู้ดูแลต้องกรอก PIN ทุกครั้งที่เข้า · สะสมแสตมป์และดูประวัติการซื้อได้ทุกอุปกรณ์</p>
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
    {isAdminRole && <>
      <h2>รหัส PIN ผู้ดูแล</h2>
      <Field label="รหัส PIN ปัจจุบัน"><input type="password" inputMode="numeric" value={currentPin} onChange={event => setCurrentPin(event.target.value)} placeholder="กรอก PIN เดิม" /></Field>
      <Field label="รหัส PIN ใหม่"><input type="password" inputMode="numeric" value={newPin} onChange={event => setNewPin(event.target.value)} placeholder="ตัวเลข 4-8 หลัก" /></Field>
      <button className="secondary" onClick={changePin}>เปลี่ยนรหัส PIN</button>
    </>}
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

export function OrderStatusScreen({ order, store, user, onOpenChat, chatOpen, chat, onChat, onSend, onResolve, onMenu, onRegistered, onConfirmReceived }) {
  if (!order) return <section className="page"><Empty text="ยังไม่มีออเดอร์ล่าสุด" action="สั่งอาหาร" onAction={onMenu} /></section>
  const settings = store.settings || {}
  const delivery = order.OrderType === 'Delivery'
  const steps = delivery ? ['Pending', 'Accepted', 'Ready', 'OutForDelivery', 'Completed'] : ['Pending', 'Accepted', 'Ready', 'Completed']
  const stepLabels = delivery ? ['รับออเดอร์', 'กำลังทำ', 'พร้อมส่ง', 'กำลังจัดส่ง', 'เสร็จสิ้น'] : ['รับออเดอร์', 'กำลังทำ', 'พร้อมรับ', 'เสร็จสิ้น']
  const currentStep = steps.indexOf(order.Status)
  const queue = order.queue
  const isActive = order.Status === 'Pending' || order.Status === 'Accepted'
  const startAt = order.StartedAt ? new Date(order.StartedAt) : null
  const readyAt = order.EstimatedTime && (startAt || order.CreatedAt)
    ? new Date((startAt || new Date(order.CreatedAt)).getTime() + num(order.EstimatedTime) * 60000)
    : null
  const disputeMinutes = num(settings.DisputeMinutes)
  const receivedAt = order.ReceivedAt ? new Date(order.ReceivedAt).getTime() : 0
  const canReport = order.Status === 'Completed' && receivedAt > 0 && disputeMinutes > 0 && (Date.now() - receivedAt) / 60000 <= disputeMinutes
  const canConfirm = order.Status === 'Completed' && !order.ReceivedAt
  const headline = {
    Pending: 'รอร้านยืนยันออเดอร์',
    Accepted: 'ร้านกำลังทำอาหาร',
    Ready: delivery ? 'อาหารพร้อม กำลังเตรียมจัดส่ง' : 'อาหารพร้อมรับที่ร้าน',
    OutForDelivery: 'กำลังดำเนินการจัดส่ง',
    Completed: 'ออเดอร์เสร็จสิ้น',
    Cancelled: 'ออเดอร์ถูกยกเลิก'
  }[order.Status] || 'ออเดอร์ของคุณ'
  const icon = order.Status === 'Completed' ? '✅' : order.Status === 'Cancelled' ? '🚫' : order.Status === 'OutForDelivery' ? '🛵' : order.Status === 'Ready' ? '📦' : '🍳'

  return <section className="page status">
    <div className="status-icon">{icon}</div>
    <h1>{headline}</h1>
    <p>หมายเลข <b>{order.OrderID}</b></p>
    <StatusBadge status={order.Status} />
    {queue && isActive && <div className="queue-card">
      <b>คิวที่ {queue.position}</b> จากทั้งหมด {queue.totalInQueue} คิว
      <div className="queue-wait">รออีกประมาณ <QueueTimer minutes={queue.waitingMinutes} /> นาที{num(queue.ahead) > 0 ? ` · มี ${queue.ahead} ออเดอร์ก่อนหน้า` : ' · เป็นคิวแรก'}</div>
    </div>}
    <div className="timeline">
      {steps.map((step, index) => <div key={step} className={`timeline-step ${index <= currentStep ? 'done' : ''}`}>
        <span className="dot" /><small>{stepLabels[index]}</small>
      </div>)}
    </div>
    {order.Status !== 'Completed' && order.Status !== 'Cancelled' && <p className="hint">เวลาทำอาหารประมาณ {num(order.EstimatedTime)} นาที{readyAt ? ` · พร้อมประมาณ ${readyAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>}
    {order.Status === 'Completed' && <p>{settings.ThankYouMessage}</p>}
    <div className="receipt">
      {(order.items || []).map(item => <div key={item.ID}><span>{item.MenuID} × {item.Quantity}</span><b>{baht(num(item.Price) * num(item.Quantity))}</b></div>)}
      {orderOptions(order).map(group => <div className="option-line" key={group.groupId}><span>{group.groupName}</span><b>{group.choices.join(', ')}</b></div>)}
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
