import React, { useEffect, useRef, useState } from 'react'
import { api, beep, isAdmin } from './api'
import { Lightbox, WelcomeModal } from './components'
import { CartScreen, CheckoutScreen, MenuScreen, OrderStatusScreen, ProfileScreen, StoreScreen } from './screens/Customer'
import AdminScreen from './screens/Admin'

const DEFAULT_STORE = { settings: {}, menu: [], promotions: [] }

export default function App() {
  const [screen, setScreen] = useState('menu')
  const [store, setStore] = useState(DEFAULT_STORE)
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem('dino-cart') || '[]'))
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('dino-user') || 'null'))
  const [order, setOrder] = useState(null)
  const [notice, setNotice] = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chat, setChat] = useState(null)
  const [welcome, setWelcome] = useState(() => !localStorage.getItem('dino-welcome') && !localStorage.getItem('dino-user'))
  const [profileInit, setProfileInit] = useState(null)
  const previousStatus = useRef(null)

  async function loadStore() {
    try { setStore(await api('getStore')) } catch (loadError) { setNotice(loadError.message) }
  }

  useEffect(() => {
    loadStore()
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  }, [])
  useEffect(() => { localStorage.setItem('dino-cart', JSON.stringify(cart)) }, [cart])
  useEffect(() => { if (user) localStorage.setItem('dino-user', JSON.stringify(user)); else localStorage.removeItem('dino-user') }, [user])

  useEffect(() => {
    if (!order?.OrderID) return
    const timer = setInterval(async () => {
      try {
        const fresh = await api('getOrder', { orderId: order.OrderID })
        setOrder(fresh)
        if (previousStatus.current && previousStatus.current !== fresh.Status) {
          const delivery = fresh.OrderType === 'Delivery'
          const messages = {
            Accepted: `ร้านรับออเดอร์แล้ว กำลังทำประมาณ ${fresh.EstimatedTime || 10} นาที`,
            Ready: delivery ? 'อาหารพร้อมแล้ว กำลังเตรียมจัดส่ง' : 'อาหารพร้อมแล้ว รับได้ที่ร้าน',
            OutForDelivery: 'กำลังดำเนินการจัดส่ง',
            Completed: 'ออเดอร์เสร็จสิ้น ขอบคุณที่ใช้บริการ',
            Cancelled: 'ออเดอร์ถูกยกเลิก'
          }
          setNotice(messages[fresh.Status] || `ออเดอร์ ${fresh.OrderID}: ${fresh.Status}`)
          beep(2)
        }
        previousStatus.current = fresh.Status
      } catch { /* ignore */ }
    }, 12000)
    return () => clearInterval(timer)
  }, [order?.OrderID])

  useEffect(() => {
    if (!chatOpen || !order?.OrderID) return
    const timer = setInterval(async () => {
      try { setChat(await api('getChat', { orderId: order.OrderID, customerPhone: user?.Phone || order.Phone })) } catch { /* ignore */ }
    }, 6000)
    return () => clearInterval(timer)
  }, [chatOpen, order?.OrderID])

  function addItem(item) {
    setCart(current => {
      const found = current.find(row => row.ID === item.ID)
      if (found) return current.map(row => row.ID === item.ID ? { ...row, quantity: row.quantity + 1 } : row)
      return [...current, { ...item, quantity: 1 }]
    })
    setNotice(`เพิ่ม ${item.Name} ลงตะกร้า`)
  }
  function updateQuantity(id, quantity) {
    setCart(current => quantity < 1 ? current.filter(row => row.ID !== id) : current.map(row => row.ID === id ? { ...row, quantity } : row))
  }
  function reorder(order) {
    const lines = (order.items || []).map(item => store.menu.find(menuItem => String(menuItem.ID) === String(item.MenuID))).filter(Boolean)
    if (!lines.length) { setNotice('เมนูในอดีตไม่พร้อมจำหน่ายแล้ว'); return }
    setCart(current => {
      let next = current.slice()
      lines.forEach(line => {
        const found = next.find(row => row.ID === line.ID)
        next = found ? next.map(row => row.ID === line.ID ? { ...row, quantity: row.quantity + 1 } : row) : next.concat([{ ...line, quantity: 1 }])
      })
      return next
    })
    setNotice('เพิ่มรายการเดิมลงตะกร้าแล้ว')
    setScreen('cart')
  }
  function handleRegistered(registered) {
    setUser(registered)
    if (order?.OrderID) api('getOrder', { orderId: order.OrderID }).then(setOrder).catch(() => {})
    setNotice('ลงทะเบียนสำเร็จ เริ่มสะสมแสตมป์ได้แล้ว')
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
    setNotice(`ยินดีต้อนรับ ${member.Name || member.Phone}`)
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
      <button className="brand" onClick={() => setScreen('menu')}>DINO<span>EATER</span></button>
      <div className="header-actions">
        {isAdmin(user) && <button className="ghost" onClick={() => setScreen('admin')}>หน้าร้าน</button>}
        <button className="cart-button" onClick={() => setScreen('cart')}>ตะกร้า <b>{cartCount}</b></button>
      </div>
    </header>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}

    {screen === 'menu' && <MenuScreen menu={store.menu} addItem={addItem} user={user} onProfile={logoutOrLogin} onLightbox={(list, index) => list?.length && setLightbox({ list, index })} />}
    {screen === 'store' && <StoreScreen store={store} user={user} onProfile={logoutOrLogin} />}
    {screen === 'cart' && <CartScreen cart={cart} updateQuantity={updateQuantity} onCheckout={() => setScreen('checkout')} onContinue={() => setScreen('menu')} />}
    {screen === 'checkout' && <CheckoutScreen cart={cart} user={user} store={store} onStoreChange={(_, nextUser) => nextUser && setUser({ ...user, ...nextUser })} onOrderCreated={created => { setCart([]); setChatOpen(false); previousStatus.current = created.Status; setOrder(created); setScreen('order') }} />}
    {screen === 'profile' && <ProfileScreen user={user} onUser={setUser} onBack={() => { setProfileInit(null); setScreen('menu') }} store={store} onReorder={reorder} init={profileInit} />}
    {screen === 'order' && <OrderStatusScreen order={order} store={store} user={user} chatOpen={chatOpen} chat={chat} onOpenChat={openChat} onSend={sendChat} onMenu={() => { setChatOpen(false); setScreen('menu') }} onRegistered={handleRegistered} />}
    {screen === 'admin' && <AdminScreen store={store} reloadStore={loadStore} user={user} requireLogin={() => setScreen('profile')} />}
    {welcome && !user && <WelcomeModal onMember={handleWelcomeMember} onGuest={handleWelcomeGuest} onAdmin={handleWelcomeAdmin} />}

    <nav>
      <button onClick={() => setScreen('menu')}>เมนู</button>
      <button onClick={() => setScreen('order')}>ออเดอร์</button>
      <button onClick={() => setScreen('cart')}>ตะกร้า {cartCount > 0 && `(${cartCount})`}</button>
      <button onClick={() => setScreen('store')}>ที่ตั้งร้าน</button>
      <button onClick={() => setScreen('profile')}>บัญชี</button>
      {isAdmin(user) && <button onClick={() => setScreen('admin')}>ร้านค้า</button>}
    </nav>

    {lightbox && <Lightbox list={lightbox.list} index={lightbox.index} onStep={delta => setLightbox(current => current ? { ...current, index: (current.index + delta + current.list.length) % current.list.length } : current)} onClose={() => setLightbox(null)} onAdd={addItem} menu={store.menu} />}
  </div>
}
