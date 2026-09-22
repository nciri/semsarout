import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiMinus, FiPlus, FiShoppingCart } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'
import BackLink from './BackLink'
import { PurchaseHistory, StockChip } from './Catalog'
import ProductArt from './ProductArt'
import { purchaseIndex, stockSignal } from './model'
import { useCart, useDh, useShopActions, useSpending } from './useShop'

function ProductDetail() {
  const { t } = useTranslation('backoffice')
  const { id } = useParams()
  const dh = useDh()
  const { data, isLoading, isError } = useQuery(['shop-product', id], () => shopService.product(id))
  const { data: cartData } = useCart()
  const { data: summary } = useSpending()
  const { add } = useShopActions()
  const [qty, setQty] = useState(1)
  const back = <BackLink to="/backoffice/boutique" label={t('shop.product.back')} />

  if (isLoading) return <div aria-busy="true" className="mx-auto h-80 w-full max-w-4xl animate-pulse rounded-xl bg-white motion-reduce:animate-none" />
  if (isError || !data?.product) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-3">
        {back}
        <p className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-500">{t('shop.product.notFound')}</p>
      </div>
    )
  }
  const p = data.product
  const inCart = (cartData?.cart?.items || []).find((it) => it.product_id === p.id)?.quantity || 0
  const room = Math.max(0, (p.stock || 0) - inCart)
  const n = Math.min(qty, Math.max(1, room))
  const [value, unit] = dh.parts(p.price)
  const signal = stockSignal(p.stock)

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-3">
      {back}
      <article className="grid overflow-hidden rounded-xl border border-gray-200 bg-white md:grid-cols-2">
        <div className="relative grid min-h-[16rem] place-items-center bg-gray-50">
          <ProductArt product={p} className="w-1/2" />
          <span className="absolute start-3 top-3"><StockChip stock={p.stock} /></span>
        </div>
        <div className="grid content-start gap-3 p-5 sm:p-6">
          <span className="text-xs text-gray-500">{t(`shop.categories.${p.category}`)}</span>
          <h1 className="font-display text-2xl font-extrabold leading-tight">{p.name}</h1>
          <span className="font-display text-[26px] font-extrabold tabular-nums">{value}<small className="ms-1 text-sm font-bold text-gray-600">{unit}</small></span>
          <p className={`m-0 text-sm ${signal === 'ok' ? 'text-gray-500' : signal === 'low' ? 'font-semibold text-amber-700' : 'font-semibold text-red-700'}`}>
            {signal === 'out' ? t('shop.stock.out') : signal === 'low' ? t('shop.stock.onlyLeft', { count: p.stock }) : t('shop.stock.inStock', { count: p.stock })}
            {inCart > 0 && ` · ${t('shop.product.inCart', { count: inCart })}`}
          </p>
          <p className="m-0 text-[13px] text-gray-500"><PurchaseHistory history={purchaseIndex(summary?.by_product).get(p.id)} price={p.price} /></p>
          {p.description && <p className="m-0 whitespace-pre-line leading-relaxed text-gray-700">{p.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center overflow-hidden rounded-lg border border-gray-200">
              <button type="button" aria-label={t('shop.cart.less')} disabled={n <= 1} onClick={() => setQty(n - 1)}
                className="grid place-items-center px-2.5 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"><FiMinus className="h-3.5 w-3.5" aria-hidden="true" /></button>
              <output aria-live="polite" aria-label={t('shop.product.quantity')} className="min-w-[32px] text-center font-semibold tabular-nums">{n}</output>
              <button type="button" aria-label={t('shop.cart.more')} disabled={n >= room} onClick={() => setQty(n + 1)}
                className="grid place-items-center px-2.5 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"><FiPlus className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </span>
            <button type="button" onClick={() => add.mutate({ id: p.id, quantity: n }, { onSuccess: () => setQty(1) })} disabled={!room || add.isLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-primary-400 bg-primary-400 px-3.5 py-2 text-[13.5px] font-semibold text-[#241906] hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-45">
              <FiShoppingCart className="h-4 w-4" aria-hidden="true" />{t('shop.product.add', { amount: dh(p.price * n) })}
            </button>
          </div>
        </div>
      </article>
    </div>
  )
}
export default ProductDetail
