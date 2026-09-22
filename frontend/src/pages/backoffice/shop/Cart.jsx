import { useTranslation } from 'react-i18next'
import BackLink from './BackLink'
import CartEditor from './CartEditor'
import { cartStats } from './model'
import { useCart, useDh, useOrders, useProducts, useProperties } from './useShop'

function Cart() {
  const { t } = useTranslation('backoffice')
  const dh = useDh()
  const { data, isLoading } = useCart()
  const { data: productsData } = useProducts()
  const { data: propsData } = useProperties()
  const { data: ordersData } = useOrders()
  const cart = data?.cart || { items: [], total: 0 }
  const s = cartStats(cart.items)
  const live = (ordersData?.orders || []).filter((o) => o.status !== 'cancelled')

  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-4">
      <BackLink to="/backoffice/boutique" label={t('shop.cart.backToShop')} />
      <div>
        <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{t('shop.cart.title')}</h1>
        <p className="mt-1 text-gray-500">{s.count ? t('shop.cart.sub', { count: s.count, amount: dh(s.total) }) : t('shop.cart.emptyTitle')}</p>
      </div>
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        {isLoading
          ? <div aria-busy="true" className="h-32 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" />
          : <CartEditor cart={cart} productsById={new Map((productsData?.products || []).map((p) => [p.id, p]))}
              properties={propsData?.properties || []} ordersCount={live.length} unlinkedCount={live.filter((o) => !o.property_id).length} />}
      </section>
    </div>
  )
}
export default Cart
