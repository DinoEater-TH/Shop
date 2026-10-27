import React, { useEffect, useRef, useState } from 'react'
import { api, beep, clearCache, driveImage, installBusyFeedback, isAdmin, readCache, writeCache } from './api'
import { Lightbox, WelcomeModal } from './components'
import { CartScreen, CheckoutScreen, MenuScreen, OrderStatusScreen, ProfileScreen, StoreScreen } from './screens/Customer'
import AdminScreen from './screens/Admin'
import { getLang, setLang, LANGUAGES, t, useLang } from './i18n'

const DEFAULT_STORE = { settings: {}, menu: [], promotions: [], popular: [] }

function staleOrder(cached) {
  if (!cached?.OrderID) return true
  const terminal = ['Completed', 'Cancelled']
  const then = new Date(cached.CreatedAt || 0).getTime()
  if (!then || Date.now() - then > 12 * 60 * 60 * 1000) return true
  if (terminal.includes(cached.Status) && Date.now() - new Date(cached.CompletedAt || cached.CreatedAt || 0).getTime() > 60 * 60 * 1000) return true
  return false
}

export default function App() {
  const currentLang = useLang()
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('dino-user') || 'null'))
  const [screen, setScreen] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('dino-user') || 'null')
      return isAdmin(cached) ? 'admin' : 'menu'
    } catch { return 'menu' }
  })
  const [store, setStore] = useState(() => readCache('store') || DEFAULT_STORE)
  const storeSettings = store?.settings || {}
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem('dino-cart') || '[]'))
  const previousStatus = useRef(null)
  const [order, setOrder] = useState(() => {
    const cached = readCache('active-order')
    if (!cached || staleOrder(cached)) return null
    previousStatus.current = cached.Status
    return cached
  })
  const [notice, setNotice] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chat, setChat] = useState(null)
  const [welcome, setWelcome] = useState(() => !localStorage.getItem('dino-welcome') && !localStorage.getItem('dino-user'))
  const [profileInit, setProfileInit] = useState(null)
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef(null)

  async function loadStore() {
    try {
      const data = await api('getStore')
      writeCache('store', data)
      setStore(data)
    } catch (loadError) {
      if (!readCache('store')) setNotice(loadError.message)
    }
  }

  useEffect(() => {
    loadStore()
    if ('storage' in navigator && navigator.storage?.persist) navigator.storage.persist().catch(() => {})
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
    return installBusyFeedback()
  }, [])
  useEffect(() => { function handle(e) { if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false) }; document.addEventListener('mousedown', handle); return () => document.removeEventListener('mousedown', handle) }, [])
  useEffect(() => { localStorage.setItem('dino-cart', JSON.stringify(cart)) }, [cart])
  useEffect(() => { if (user) localStorage.setItem('dino-user', JSON.stringify(user)); else localStorage.removeItem('dino-user') }, [user])
  useEffect(() => { if (order?.OrderID) writeCache('active-order', order); else clearCache('active-order') }, [order])

  useEffect(() => {
    if (!order?.OrderID) return
    let alive = true
    async function poll() {
      try {
        const fresh = await api('getOrder', { orderId: order.OrderID }, true)
        if (!alive) return
        setOrder(fresh)
        if (previousStatus.current && previousStatus.current !== fresh.Status) {
          const delivery = fresh.OrderType === 'Delivery'
          const messages = {
            Accepted: t('ร้านรับออเดอร์แล้ว กำลังทำประมาณ {minutes} นาที', { minutes: fresh.EstimatedTime || 10 }),
            Ready: delivery ? t('อาหารพร้อมแล้ว กำลังเตรียมจัดส่ง') : t('อาหารพร้อมแล้ว รับได้ที่ร้าน'),
            OutForDelivery: t('กำลังดำเนินการจัดส่ง'),
            Completed: t('ออเดอร์เสร็จสิ้น ขอบคุณที่ใช้บริการ'),
            Cancelled: t('ออเดอร์ถูกยกเลิก')
          }
          setNotice(messages[fresh.Status] || `ออเดอร์ ${fresh.OrderID}: ${fresh.Status}`)
          beep(2)
        }
        previousStatus.current = fresh.Status
      } catch { /* ignore */ }
    }
    poll()
    const timer = setInterval(poll, 12000)
    return () => { alive = false; clearInterval(timer) }
  }, [order?.OrderID])

  useEffect(() => {
    if (!chatOpen || !order?.OrderID) return
    const timer = setInterval(async () => {
      try { setChat(await api('getChat', { orderId: order.OrderID, customerPhone: user?.Phone || order.Phone }, true)) } catch { /* ignore */ }
    }, 6000)
    return () => clearInterval(timer)
  }, [chatOpen, order?.OrderID])

  function addItem(item) {
    setCart(current => {
      const found = current.find(row => row.ID === item.ID)
      if (found) return current.map(row => row.ID === item.ID ? { ...row, quantity: row.quantity + 1 } : row)
      return [...current, { ...item, quantity: 1 }]
    })
    setNotice(t('เพิ่ม {name} ลงตะกร้า', { name: item.Name }))
  }
  function updateQuantity(id, quantity) {
    setCart(current => quantity < 1 ? current.filter(row => row.ID !== id) : current.map(row => row.ID === id ? { ...row, quantity } : row))
  }
  function reorder(order) {
    const lines = (order.items || []).map(item => store.menu.find(menuItem => String(menuItem.ID) === String(item.MenuID))).filter(Boolean)
    if (!lines.length) { setNotice(t('เมนูในอดีตไม่พร้อมจำหน่ายแล้ว')); return }
    setCart(current => {
      let next = current.slice()
      lines.forEach(line => {
        const found = next.find(row => row.ID === line.ID)
        next = found ? next.map(row => row.ID === line.ID ? { ...row, quantity: row.quantity + 1 } : row) : next.concat([{ ...line, quantity: 1 }])
      })
      return next
    })
    setNotice(t('เพิ่มรายการเดิมลงตะกร้าแล้ว'))
    setScreen('cart')
  }
  function handleRegistered(registered) {
    setUser(registered)
    if (order?.OrderID) api('getOrder', { orderId: order.OrderID }).then(setOrder).catch(() => {})
    setNotice(t('ลงทะเบียนสำเร็จ เริ่มสะสมแสตมป์ได้แล้ว'))
  }
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  async function openChat(target) {
    try {
      const result = await api('openDispute', { orderId: target.OrderID, customerPhone: user?.Phone || target.Phone, message: 'รายงานปัญหา' })
      setChat(result)
      setChatOpen(true)
    } catch (chatError) { setNotice(chatError.message) }
  }
  async function sendChat(message) {
    try { setChat(await api('sendChat', { orderId: order.OrderID, customerPhone: user?.Phone || order.Phone, message })) } catch (sendError) { setNotice(sendError.message) }
  }

  function logoutOrLogin() { setScreen('profile') }

  function handleWelcomeMember(member) {
    localStorage.setItem('dino-welcome', 'done')
    setUser(member)
    setWelcome(false)
    if (order?.OrderID) api('getOrder', { orderId: order.OrderID }).then(setOrder).catch(() => {})
    setNotice(t('ยินดีต้อนรับ {name}', { name: member.Name || member.Phone }))
    if (isAdmin(member)) setScreen('admin')
  }
  function handleAuthSuccess(nextUser) {
    setUser(nextUser)
    setProfileInit(null)
    setScreen(isAdmin(nextUser) ? 'admin' : 'menu')
  }
  function handleWelcomeGuest() {
    localStorage.setItem('dino-welcome', 'done')
    setWelcome(false)
  }
  function handleWelcomeAdmin(info) {
    localStorage.setItem('dino-welcome', 'done')
    setWelcome(false)
    setProfileInit(info)
    setScreen('profile')
  }

  return <div className="app-shell">
    <header>
      <button className="brand" onClick={() => setScreen('menu')}>
        {storeSettings.StoreLogo ? (
          <img className="brand-logo" src={driveImage(storeSettings.StoreLogo, 80)} alt="" />
        ) : (
          <span className="brand-icon">🍗</span>
        )}
        {storeSettings.StoreName && storeSettings.StoreName.toLowerCase() !== 'dinoeater' ? (
          <span>{storeSettings.StoreName}</span>
        ) : (
          <span>DINO<span className="brand-highlight">EATER</span></span>
        )}
      </button>
      <div className="header-actions">
        <div className="lang-wrap" ref={langRef}>
          <button className="lang-trigger" onClick={() => setLangOpen(v => !v)}>{LANGUAGES.find(l => l.code === getLang()).label}<span className="lang-arrow">{langOpen ? '▲' : '▼'}</span></button>
          {langOpen && <div className="lang-menu">{LANGUAGES.filter(l => l.code !== getLang()).map(lang => <button key={lang.code} className="lang-opt" onClick={() => { setLang(lang.code); setLangOpen(false) }}>{lang.label}</button>)}</div>}
        </div>
        {isAdmin(user) && <button className="ghost compact" onClick={() => setScreen('admin')}>{t('หน้าร้าน')}</button>}
        <button className="cart-button" onClick={() => setScreen('cart')}>{t('ตะกร้า')} <b>{cartCount}</b></button>
      </div>
    </header>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}

    {screen === 'menu' && <MenuScreen store={store} menu={store.menu} popular={store.popular || []} addItem={addItem} user={user} onProfile={logoutOrLogin} onLightbox={(list, index) => list?.length && setLightbox({ list, index })} />}
    {screen === 'store' && <StoreScreen store={store} user={user} onProfile={logoutOrLogin} />}
    {screen === 'cart' && <CartScreen cart={cart} updateQuantity={updateQuantity} onCheckout={() => setScreen('checkout')} onContinue={() => setScreen('menu')} />}
    {screen === 'checkout' && <CheckoutScreen cart={cart} user={user} store={store} onStoreChange={(_, nextUser) => nextUser && setUser({ ...user, ...nextUser })} onOrderCreated={created => { setCart([]); setChatOpen(false); previousStatus.current = created.Status; setOrder(created); setScreen('order') }} />}
    {screen === 'profile' && <ProfileScreen user={user} onUser={setUser} onAuthSuccess={handleAuthSuccess} onBack={() => { setProfileInit(null); setScreen(isAdmin(user) ? 'admin' : 'menu') }} store={store} onReorder={reorder} init={profileInit} />}
    {screen === 'order' && <OrderStatusScreen order={order} store={store} user={user} chatOpen={chatOpen} chat={chat} onOpenChat={openChat} onSend={sendChat} onMenu={() => { setChatOpen(false); setScreen('menu') }} onRegistered={handleRegistered} />}
    {screen === 'admin' && <AdminScreen store={store} reloadStore={loadStore} user={user} requireLogin={() => setScreen('profile')} />}
    {welcome && !user && <WelcomeModal onMember={handleWelcomeMember} onGuest={handleWelcomeGuest} onAdmin={handleWelcomeAdmin} />}

    <nav>
      <button onClick={() => setScreen('menu')}>{t('เมนู')}</button>
      <button onClick={() => setScreen('order')}>{t('ออเดอร์')}</button>
      <button onClick={() => setScreen('cart')}>{t('ตะกร้า')} {cartCount > 0 && `(${cartCount})`}</button>
      <button onClick={() => setScreen('store')}>{t('ที่ตั้งร้าน')}</button>
      <button onClick={() => setScreen('profile')}>{t('บัญชี')}</button>
      {isAdmin(user) && <button onClick={() => setScreen('admin')}>{t('ร้านค้า')}</button>}
    </nav>

    {lightbox && <Lightbox list={lightbox.list} index={lightbox.index} onStep={delta => setLightbox(current => current ? { ...current, index: (current.index + delta + current.list.length) % current.list.length } : current)} onClose={() => setLightbox(null)} onAdd={addItem} menu={store.menu} />}
  </div>
}
