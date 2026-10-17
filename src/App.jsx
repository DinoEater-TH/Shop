import React, { useEffect, useRef, useState } from 'react'
import { api, beep, isAdmin } from './api'
import { Lightbox } from './components'
import { CartScreen, CheckoutScreen, MenuScreen, OrderStatusScreen, ProfileScreen } from './screens/Customer'
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
          setNotice(`ออเดอร์ ${fresh.OrderID} อัปเดตเป็น: ${fresh.Status}`)
          beep(2)
        }
        previousStatus.current = fresh.Status
      } catch { /* keep silent on polling errors */ }
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

  return <div className="app-shell">
    <header>
      <button className="brand" onClick={() => setScreen('menu')}>DINO<span>EATER</span></button>
      <div className="header-actions">
        {isAdmin(user) && <button className="ghost" onClick={() => setScreen('admin')}>หน้าร้าน</button>}
        <button className="cart-button" onClick={() => setScreen('cart')}>ตะกร้า <b>{cartCount}</b></button>
      </div>
    </header>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}

    {screen === 'menu' && <MenuScreen menu={store.menu} addItem={addItem} user={user} onProfile={logoutOrLogin} onLightbox={(src, title) => setLightbox({ src, title })} />}
    {screen === 'cart' && <CartScreen cart={cart} updateQuantity={updateQuantity} onCheckout={() => setScreen('checkout')} onContinue={() => setScreen('menu')} />}
    {screen === 'checkout' && <CheckoutScreen cart={cart} user={user} store={store} onStoreChange={(_, nextUser) => nextUser && setUser({ ...user, ...nextUser })} onOrderCreated={created => { setCart([]); setChatOpen(false); previousStatus.current = created.Status; setOrder(created); setScreen('order') }} />}
    {screen === 'profile' && <ProfileScreen user={user} onUser={setUser} onBack={() => setScreen('menu')} store={store} />}
    {screen === 'order' && <OrderStatusScreen order={order} store={store} user={user} chatOpen={chatOpen} chat={chat} onOpenChat={openChat} onSend={sendChat} onMenu={() => { setChatOpen(false); setScreen('menu') }} />}
    {screen === 'admin' && <AdminScreen store={store} reloadStore={loadStore} user={user} requireLogin={() => setScreen('profile')} />}

    <nav>
      <button onClick={() => setScreen('menu')}>เมนู</button>
      <button onClick={() => setScreen('order')}>ออเดอร์</button>
      <button onClick={() => setScreen('cart')}>ตะกร้า {cartCount > 0 && `(${cartCount})`}</button>
      <button onClick={() => setScreen('profile')}>บัญชี</button>
      {isAdmin(user) && <button onClick={() => setScreen('admin')}>ร้านค้า</button>}
    </nav>

    {lightbox && <Lightbox src={lightbox.src} title={lightbox.title} onClose={() => setLightbox(null)} />}
  </div>
}
