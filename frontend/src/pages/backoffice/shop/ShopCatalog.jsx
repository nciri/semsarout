import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiCreditCard, FiPackage, FiShoppingCart } from 'react-icons/fi'
import useAuthStore from '../../../store/authStore'
import { IconAction, Widget } from '../components/kit'
import Catalog from './Catalog'
import OrdersTracking from './OrdersTracking'
import { CartDetail, CartsCompact, OrdersCard, SpendCompact, SpendDetail } from './SummaryWidgets'
import { cartStats, purchaseIndex } from './model'
import { useCart, useCategories, useMembers, useOrders, useProducts, useProperties, useSpending, useTeamCarts } from './useShop'

const STORE = 'shop-open'
function readOpen() {
  // Les dépenses sont ouvertes au premier passage ; ensuite on retrouve l'état laissé par l'agent.
  try { const s = localStorage.getItem(STORE); return s === null ? 'spend' : s || null } catch { return 'spend' }
}
function writeOpen(key) { try { localStorage.setItem(STORE, key || '') } catch { /* stockage indisponible */ } }

const CARDS = ['orders', 'carts', 'spend']

export default function ShopCatalog() {
  const { t } = useTranslation('backoffice')
  const { user } = useAuthStore()
  const me = user?.id
  const now = new Date()
  const { data: productsData, isLoading: productsLoading } = useProducts()
  const { data: catData } = useCategories()
  const { data: cartData } = useCart()
  const { data: teamData, isError: teamError } = useTeamCarts()
  const { data: ordersData, isLoading: ordersLoading } = useOrders()
  const { data: summary } = useSpending()
  const { data: propsData } = useProperties()
  const members = useMembers()

  const products = productsData?.products || []
  const productsById = new Map(products.map((p) => [p.id, p]))
  const orders = ordersData?.orders || []
  const properties = propsData?.properties || []
  const propertiesById = new Map(properties.map((p) => [p.id, p]))
  const cart = cartData?.cart
  const myCount = cartStats(cart?.items).count
  // Sans la vue équipe (API plus ancienne), on montre au moins son propre panier.
  const carts = teamData?.carts || (teamError && cart?.items?.length ? [{ user_id: me, ...cart }] : [])
  const history = purchaseIndex(summary?.by_product)
  const inCart = new Map((cart?.items || []).map((it) => [it.product_id, it.quantity]))

  const [openKey, setOpenKey] = useState(readOpen)
  const [shown, setShown] = useState(false)
  const [place, setPlace] = useState({ after: null, notch: 0 })
  const [tick, setTick] = useState(0)
  const gridRef = useRef(null)
  const cardRefs = useRef({})
  const titleRef = useRef(null)
  const focusTitle = useRef(false)
  const closeTimer = useRef(null)

  const close = useCallback(() => {
    if (!openKey) return
    const k = openKey
    setShown(false)
    writeOpen(null)
    closeTimer.current = setTimeout(() => setOpenKey(null), 240)
    cardRefs.current[k]?.querySelector('[aria-expanded]')?.focus({ preventScroll: true })
  }, [openKey])

  const toggle = (key) => {
    if (key === openKey) { close(); return }
    clearTimeout(closeTimer.current)
    focusTitle.current = true
    setShown(false)
    setOpenKey(key)
    writeOpen(key)
  }
  const openCart = () => { if (openKey === 'carts') titleRef.current?.focus(); else toggle('carts') }
  const follow = () => document.getElementById('orders')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })

  // Même mécanique que le tableau de bord : le détail suit la DERNIÈRE carte de la rangée du
  // widget ouvert, et son repère pointe sur ce widget.
  useLayoutEffect(() => {
    if (!openKey) return
    const card = cardRefs.current[openKey]
    const grid = gridRef.current
    if (!card || !grid) return
    const row = CARDS.map((k) => cardRefs.current[k]).filter((el) => el && el.offsetTop === card.offsetTop)
    const after = CARDS.find((k) => cardRefs.current[k] === row.at(-1)) || openKey
    const g = grid.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    const rtl = getComputedStyle(grid).direction === 'rtl'
    const notch = (rtl ? g.right - c.right : c.left - g.left) + c.width / 2
    setPlace((p) => (p.after === after && Math.abs(p.notch - notch) < 1 ? p : { after, notch }))
  }, [openKey, tick, ordersLoading])

  useEffect(() => {
    const onResize = () => setTick((n) => n + 1)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!openKey) return undefined
    const id = requestAnimationFrame(() => {
      setShown(true)
      if (focusTitle.current) {
        focusTitle.current = false
        titleRef.current?.focus({ preventScroll: true })
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        setTimeout(() => gridRef.current?.querySelector('#dashboard-detail')?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }), 60)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [openKey])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  const detailBody = openKey === 'carts'
    ? <CartDetail cart={cart} productsById={productsById} properties={properties} orders={orders} onClose={close} titleRef={titleRef} />
    : openKey === 'spend'
      ? <SpendDetail summary={summary} products={products} orders={orders} members={members} me={me} onClose={close} titleRef={titleRef} />
      : null
  const after = place.after || openKey
  const detail = detailBody && (
    <div id="dashboard-detail" role="region" aria-labelledby="dashboard-detail-title"
      className="col-span-full grid transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: shown ? '1fr' : '0fr' }}>
      <div className="min-h-0 overflow-hidden pt-2.5">
        <div className="relative rounded-xl border border-primary-400 bg-white shadow-[0_1px_2px_rgba(11,18,32,.04),0_14px_30px_-20px_rgba(11,18,32,.25)]">
          <span aria-hidden="true" className="absolute -top-[8px] h-3.5 w-3.5 -ms-[7px] rotate-45 border-s border-t border-primary-400 bg-white" style={{ insetInlineStart: place.notch }} />
          {detailBody}
        </div>
      </div>
    </div>
  )

  const cards = {
    orders: <div ref={(el) => { cardRefs.current.orders = el }} className="grid"><OrdersCard orders={orders} onFollow={follow} /></div>,
    carts: (
      <Widget id="carts" title={t('shop.summary.carts.title')} icon={FiShoppingCart} open={openKey === 'carts'}
        onToggle={() => toggle('carts')} cardRef={(el) => { cardRefs.current.carts = el }}>
        <CartsCompact carts={carts} me={me} members={members} productsById={productsById} />
      </Widget>
    ),
    spend: (
      <Widget id="spend" title={t('shop.spend.title')} icon={FiCreditCard} open={openKey === 'spend'}
        onToggle={() => toggle('spend')} cardRef={(el) => { cardRefs.current.spend = el }}>
        <SpendCompact summary={summary} products={products} />
      </Widget>
    ),
  }

  return (
    <div className="mx-auto grid w-full max-w-[1360px] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{t('shop.title')}</h1>
          <p className="mt-1 text-gray-500">{t('shop.subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <IconAction icon={FiPackage} label={t('shop.summary.orders.follow')} onClick={follow} className="border border-gray-200 bg-white" />
          <span className="relative inline-flex">
            <IconAction icon={FiShoppingCart} tone="primary" tipAlign="end" onClick={openCart} aria-controls="dashboard-detail"
              label={t('shop.cart.button', { count: myCount })} />
            {myCount > 0 && (
              <span aria-hidden="true" className="pointer-events-none absolute -end-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#241906] px-1.5 text-[11.5px] font-bold tabular-nums text-white">{myCount}</span>
            )}
          </span>
        </div>
      </div>

      <div ref={gridRef} className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((k) => [
          <div key={k} className="contents">{cards[k]}</div>,
          after === k ? <div key="detail" className="contents">{detail}</div> : null,
        ])}
      </div>

      <Catalog products={products} categories={catData?.categories || []} history={history} inCart={inCart} isLoading={productsLoading} />

      <OrdersTracking orders={orders} members={members} propertiesById={propertiesById} me={me} isLoading={ordersLoading} now={now} />
    </div>
  )
}
