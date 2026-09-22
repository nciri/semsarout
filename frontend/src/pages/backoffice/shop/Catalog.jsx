import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiCheck, FiPlus, FiSearch, FiShoppingBag } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Chip, IconAction, Segmented } from '../components/kit'
import ProductArt from './ProductArt'
import { filterProducts, priceDelta, stockSignal } from './model'
import { useDh, useShopActions } from './useShop'

export function StockChip({ stock }) {
  const { t } = useTranslation('backoffice')
  const s = stockSignal(stock)
  if (s === 'ok') return null
  return <Chip tone={s === 'out' ? 'crit' : 'warn'}>{s === 'out' ? t('shop.stock.out') : t('shop.stock.onlyLeft', { count: stock })}</Chip>
}

/** « Commandé ×3 par l'agence · +31 % depuis » : ce que l'agence a déjà payé pour ce produit. */
export function PurchaseHistory({ history, price }) {
  const { t } = useTranslation('backoffice')
  const { fmtNumber } = useFormat()
  if (!history) return <>{t('shop.catalog.neverOrdered')}</>
  const d = priceDelta(price, history.last_unit_price)
  return (
    <>
      {t('shop.catalog.ordered', { count: history.quantity })}
      {Math.abs(d) > 0.005 && <> · <b className="font-semibold text-gray-600">{t('shop.catalog.since', { delta: fmtNumber(d, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'always' }) })}</b></>}
    </>
  )
}

export default function Catalog({ products, categories, history, inCart, isLoading }) {
  const { t } = useTranslation('backoffice')
  const dh = useDh()
  const { add } = useShopActions()
  const [f, setF] = useState({ group: '', category: '', q: '' })
  const list = filterProducts(products, f)
  const low = products.filter((p) => stockSignal(p.stock) === 'low').length
  const never = products.filter((p) => !history.has(p.id)).length
  const count = (g) => products.filter((p) => !g || p.group === g).length

  return (
    <section aria-labelledby="catalog-title" className="grid min-w-0 gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="catalog-title" className="flex items-center gap-2 font-display text-base font-bold">
            <FiShoppingBag className="h-[18px] w-[18px] text-gray-400" aria-hidden="true" />{t('shop.catalog.title')}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">{t('shop.catalog.sub', { count: products.length, low, never })}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Segmented label={t('shop.catalog.groupLabel')} value={f.group} onChange={(group) => setF({ ...f, group, category: '' })}
            options={['', 'furniture', 'appliance'].map((g) => ({
              value: g,
              label: <>{t(`shop.groups.${g || 'all'}`)}<span className="ms-1 font-semibold tabular-nums text-gray-500">{count(g)}</span></>,
            }))} />
          <select aria-label={t('shop.catalog.categoryLabel')} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}
            className="max-w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px]">
            <option value="">{t('shop.catalog.allCategories')}</option>
            {categories.filter((c) => !f.group || c.group === f.group).map((c) => {
              const n = products.filter((p) => p.category === c.id).length
              return <option key={c.id} value={c.id} disabled={!n}>{n ? t(`shop.categories.${c.id}`) : t('shop.catalog.categoryEmpty', { label: t(`shop.categories.${c.id}`) })}</option>
            })}
          </select>
          <label className="flex min-w-0 max-w-full flex-[1_1_180px] items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-gray-500 sm:max-w-[260px]">
            <FiSearch className="h-4 w-4 flex-none" aria-hidden="true" />
            <input type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label={t('shop.catalog.search')}
              placeholder={t('shop.catalog.search')} className="w-full min-w-0 border-0 bg-transparent p-0 text-[13px] text-gray-900 outline-none focus:ring-0" />
          </label>
        </div>
      </div>

      {isLoading ? (
        <div aria-busy="true" className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(196px,1fr))] sm:gap-3.5">
          {[...Array(8)].map((_, i) => <div key={i} className="h-60 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" />)}
        </div>
      ) : !list.length ? (
        <p className="rounded-lg border border-dashed border-gray-200 p-7 text-center text-sm text-gray-500">{t('shop.catalog.empty')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(196px,1fr))] sm:gap-3.5">
          {list.map((p) => {
            const qty = inCart.get(p.id) || 0
            const full = stockSignal(p.stock) === 'out' || qty >= p.stock
            return (
              <article key={p.id} className="flex min-w-0 flex-col rounded-lg border border-gray-200 transition-colors hover:border-[#D9D3C8]">
                <Link to={`/backoffice/boutique/${p.id}`} tabIndex={-1} aria-hidden="true" className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-t-lg bg-gray-50">
                  <ProductArt product={p} />
                  <span className="absolute start-2 top-2"><StockChip stock={p.stock} /></span>
                </Link>
                <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:px-3.5 sm:pb-3.5 sm:pt-3">
                  <span className="text-xs text-gray-500">
                    {t(`shop.categories.${p.category}`)}{stockSignal(p.stock) === 'ok' && ` · ${t('shop.stock.inStock', { count: p.stock })}`}
                  </span>
                  <Link to={`/backoffice/boutique/${p.id}`} className="font-semibold leading-snug text-gray-900 hover:text-primary-700">{p.name}</Link>
                  <span className="min-h-[18px] text-xs text-gray-500"><PurchaseHistory history={history.get(p.id)} price={p.price} /></span>
                  {/* Poussée en bas : prix et bouton alignés d'une carte à l'autre, quelle que soit la longueur du nom. */}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="font-display text-[17px] font-extrabold tabular-nums">{dh.parts(p.price)[0]}<small className="ms-0.5 text-xs font-bold text-gray-600">{dh.parts(p.price)[1]}</small></span>
                    <span className="flex items-center gap-1">
                      {qty > 0 && <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700"><FiCheck className="h-3.5 w-3.5" aria-hidden="true" />{qty}</span>}
                      <IconAction icon={FiPlus} tone="primary" tipAlign="end" disabled={full || add.isLoading}
                        label={qty ? t('shop.catalog.addAnother', { name: p.name, count: qty }) : t('shop.catalog.add', { name: p.name })}
                        onClick={() => add.mutate({ id: p.id })} className="p-1.5 disabled:cursor-not-allowed disabled:opacity-45" />
                    </span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
