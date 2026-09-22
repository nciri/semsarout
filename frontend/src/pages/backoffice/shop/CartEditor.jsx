import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiMinus, FiPlus, FiTrash2 } from 'react-icons/fi'
import SearchableSelect from '../../../components/common/SearchableSelect'
import { Alert, DetailColumns, IconAction, Rich } from '../components/kit'
import ProductArt from './ProductArt'
import { cartStats, stockSignal } from './model'
import { useDh, useShopActions } from './useShop'

/** Lignes du panier + livraison + commande : partagé par la vue dépliée et la page /panier. */
export default function CartEditor({ cart, productsById, properties = [], ordersCount = 0, unlinkedCount = 0 }) {
  const { t } = useTranslation('backoffice')
  const dh = useDh()
  const navigate = useNavigate()
  const { update, remove, checkout } = useShopActions()
  const [propertyId, setPropertyId] = useState('')
  const [address, setAddress] = useState('')
  const items = cart?.items || []
  const stats = cartStats(items)
  const low = stats.low[0]

  if (!items.length) {
    return <p className="rounded-lg border border-dashed border-gray-200 p-7 text-center text-sm text-gray-500">{t('shop.cart.empty')}</p>
  }

  const order = () => checkout.mutate(
    { property_id: propertyId ? Number(propertyId) : undefined, delivery_address: address || undefined },
    { onSuccess: (res) => navigate(`/backoffice/mes-commandes/${res.order.id}`) },
  )

  return (
    <DetailColumns
      main={(
        <ul className="grid">
          {items.map((it) => {
            const p = { ...(productsById.get(it.product_id) || {}), ...(it.product || {}) }
            const signal = stockSignal(p.stock)
            return (
              <li key={it.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t border-gray-100 py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[44px_minmax(0,1fr)_auto_auto_auto]">
                <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-gray-50"><ProductArt product={p} className="w-[30px]" /></span>
                <span className="min-w-0">
                  <b className="block truncate font-semibold">{p.name || '—'}</b>
                  <span className="text-[12.5px] text-gray-500">
                    {dh(p.price)} · {signal === 'low'
                      ? <span className="font-semibold text-amber-700">{t('shop.stock.onlyLeft', { count: p.stock })}</span>
                      : t('shop.stock.inStock', { count: p.stock || 0 })}
                  </span>
                </span>
                <span className="col-start-2 inline-flex w-fit items-center overflow-hidden rounded-lg border border-gray-200 sm:col-start-auto">
                  <button type="button" aria-label={t('shop.cart.less')} disabled={it.quantity <= 1 || update.isLoading}
                    onClick={() => update.mutate({ id: it.id, quantity: it.quantity - 1 })}
                    className="grid place-items-center px-2 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"><FiMinus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  <output aria-live="polite" className="min-w-[26px] text-center font-semibold tabular-nums">{it.quantity}</output>
                  <button type="button" aria-label={t('shop.cart.more')} disabled={it.quantity >= (p.stock || 0) || update.isLoading}
                    onClick={() => update.mutate({ id: it.id, quantity: it.quantity + 1 })}
                    className="grid place-items-center px-2 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-35"><FiPlus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </span>
                <span className="col-start-3 row-start-2 min-w-[84px] text-end font-semibold tabular-nums sm:col-start-auto sm:row-start-auto">{dh(it.line_total)}</span>
                <IconAction icon={FiTrash2} tone="danger" tipAlign="end" label={t('shop.cart.remove', { name: p.name })}
                  onClick={() => remove.mutate(it.id)} className="col-start-3 row-start-1 sm:col-start-auto" />
              </li>
            )
          })}
        </ul>
      )}
      aside={<>
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-semibold text-gray-600">{t('shop.cart.deliverToProperty')}</span>
          <SearchableSelect
            value={propertyId}
            onChange={setPropertyId}
            options={properties.map((p) => ({ value: p.id, label: p.title || p.reference, description: p.city }))}
            placeholder={t('shop.cart.freeAddress')}
            searchPlaceholder={t('shop.cart.propertySearch')}
            clearable
          />
        </div>
        {!propertyId && (
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-semibold text-gray-600">{t('shop.cart.deliveryAddress')}</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address"
              placeholder={t('shop.cart.addressPlaceholder')}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </label>
        )}
        <p className="m-0 text-[12.5px] text-gray-500">
          {ordersCount > 0 && unlinkedCount === ordersCount
            ? t('shop.cart.linkHintNone', { count: ordersCount })
            : t('shop.cart.linkHint')}
        </p>
        {low && (
          <Alert tone="warn" icon={FiAlertTriangle}>
            <Rich i18nKey="shop.cart.lowStock" values={{ name: low.product.name, count: low.product.stock }} />
          </Alert>
        )}
        <button type="button" onClick={order} disabled={checkout.isLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary-400 bg-primary-400 px-3.5 py-2 text-[13.5px] font-semibold text-[#241906] hover:bg-primary-600 disabled:opacity-50">
          {t('shop.cart.order', { amount: dh(stats.total) })}
        </button>
      </>}
    />
  )
}
