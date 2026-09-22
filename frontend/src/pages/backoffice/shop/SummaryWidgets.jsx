import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiArrowDown, FiHome, FiPackage, FiTag } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, IconAction, Kv, Legend, Rich, SegBar, TD, TH } from '../components/kit'
import CartEditor from './CartEditor'
import SpendChart, { PAID, PENDING } from './SpendChart'
import {
  buyerItems, cartStats, groupSplit, isRetired, latestMonth, openOrders, priceRises, purchaseIndex, rebuy, spendByCategory, stockSignal,
} from './model'
import { useDh } from './useShop'

const STAGE_COLORS = { pending: '#B45309', paid: '#6BB5AC', preparing: '#0F766E', shipped: '#3366CC', delivered: '#D9D5CD' }

const monthDate = (m) => new Date(`${m}-01T12:00:00`)

/** Carte de synthèse sans vue dépliée (même habillage que les widgets du kit). */
export function Card({ id, title, icon: Icon, action, children }) {
  return (
    <section aria-labelledby={`w-${id}`} className="grid content-start gap-3.5 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2.5">
        <h2 id={`w-${id}`} className="flex items-center gap-2 font-display text-[14.5px] font-bold">
          <Icon className="h-[17px] w-[17px] text-gray-400" aria-hidden="true" />{title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function OrdersCard({ orders, onFollow }) {
  const { t } = useTranslation('backoffice')
  const dh = useDh()
  const o = openOrders(orders)
  const retired = o.retiredPending
  const names = [...new Set(retired.flatMap((x) => (x.items || []).filter(isRetired).map((i) => i.product_name)))]
  const stages = Object.keys(STAGE_COLORS)

  return (
    <Card id="orders-card" icon={FiPackage} title={t('shop.summary.orders.title')}
      action={<IconAction icon={FiArrowDown} label={t('shop.summary.orders.follow')} onClick={onFollow} tone="gold" tipAlign="end" className="-m-2" />}>
      <Figure value={o.count}>
        {t(o.by.shipped || !o.count ? 'shop.summary.orders.figure' : 'shop.summary.orders.figureNoShip', { count: o.count })}
      </Figure>
      {o.by.pending > 0 && <div><Chip tone="warn">{t('shop.summary.orders.toPay', { count: o.by.pending })}</Chip></div>}
      {orders.length > 0 && (
        <div className="grid gap-2">
          <SegBar label={t('shop.summary.orders.barLabel', stages.reduce((a, s) => ({ ...a, [s]: o.by[s] }), {}))}
            parts={stages.map((s) => ({ value: o.by[s], color: STAGE_COLORS[s] }))} />
          <Legend items={stages.filter((s) => o.by[s] || s !== 'shipped').map((s) => ({ color: STAGE_COLORS[s], label: `${t(`shop.status.${s}`)} ${o.by[s]}` }))} />
        </div>
      )}
      {retired.length > 0 && (
        <Alert tone="crit" icon={FiAlertCircle}>
          <Rich i18nKey="shop.summary.orders.retiredAlert" values={{
            count: retired.length, names: names.join(', '), amount: dh(retired.reduce((n, x) => n + x.total, 0)),
          }} />
        </Alert>
      )}
    </Card>
  )
}

export function CartsCompact({ carts, me, members, productsById }) {
  const { t } = useTranslation('backoffice')
  const dh = useDh()
  const [value, unit] = dh.parts(carts.reduce((n, c) => n + c.total, 0))
  if (!carts.length) return <p className="text-sm text-gray-500">{t('shop.summary.carts.empty')}</p>
  const ordered = [...carts].sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : b.total - a.total))

  return (
    <>
      <Figure value={value} unit={unit}>{t('shop.summary.carts.inCarts', { count: carts.length })}</Figure>
      <ul aria-label={t('shop.summary.carts.listLabel')} className="grid">
        {ordered.map((c) => {
          const s = cartStats(c.items)
          const first = c.items[0]?.product?.name || '—'
          const low = c.items.some((it) => stockSignal((it.product || productsById.get(it.product_id))?.stock) === 'low')
          return (
            <li key={c.user_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
              <b className="truncate font-semibold">
                {c.user_id === me ? t('shop.summary.carts.mine', { count: s.count }) : members.get(c.user_id) || t('shop.orders.memberUnknown', { id: c.user_id })}
              </b>
              <span className="col-start-2 row-span-2 row-start-1 self-center font-semibold tabular-nums">{dh(c.total)}</span>
              <span className="truncate text-[12.5px] text-gray-500">
                {c.items.length > 1 ? t('shop.summary.carts.andOthers', { name: first, count: c.items.length - 1 }) : first}
                {low && ` · ${t('shop.summary.carts.lowStock')}`}
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

export function CartDetail({ cart, productsById, properties, orders, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const dh = useDh()
  const s = cartStats(cart?.items)
  const live = orders.filter((o) => o.status !== 'cancelled')
  return (
    <DetailFrame title={t('shop.cart.title')} onClose={onClose} titleRef={titleRef}
      sub={s.count ? t('shop.cart.sub', { count: s.count, amount: dh(s.total) }) : t('shop.cart.emptyTitle')}>
      <CartEditor cart={cart} productsById={productsById} properties={properties}
        ordersCount={live.length} unlinkedCount={live.filter((o) => !o.property_id).length} />
    </DetailFrame>
  )
}

function useCategoryLabel() {
  const { t } = useTranslation('backoffice')
  return (r) => (r.category ? t(`shop.categories.${r.category}`) : t('shop.spend.retiredRow', { name: r.name }))
}

export function SpendCompact({ summary, products }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate, fmtNumber } = useFormat()
  const dh = useDh()
  const label = useCategoryLabel()
  const lm = latestMonth(summary?.by_month)
  if (!lm) return <p className="text-sm text-gray-500">{t('shop.spend.empty')}</p>
  const rows = spendByCategory(summary.by_product, products)
  const g = groupSplit(rows)
  const [value, unit] = dh.parts(lm.paid)
  const rises = priceRises(summary.by_product).slice(0, 2)
  const pct = (d) => fmtNumber(d, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'always' })
  const names = (group) => rows.filter((r) => r.group === group && r.paid > 0).map(label).join(', ')
  const sub = (group) => (g[group].pending > 0 ? t('shop.spend.pendingAmount', { amount: dh(g[group].pending) }) : names(group) || t('shop.spend.nothing'))

  return (
    <>
      <Figure value={value} unit={unit}>{t('shop.spend.paidIn', { month: fmtDate(monthDate(lm.month), { month: 'long' }) })}</Figure>
      <div className="grid grid-cols-2 gap-3">
        {['furniture', 'appliance'].map((k) => {
          const [v, u] = dh.parts(g[k].paid)
          return <Kv key={k} label={t(`shop.groups.${k}`)} value={v} unit={u} sub={sub(k)} />
        })}
      </div>
      {rises.length > 0 && (
        <Alert tone="info" icon={FiTag}>
          <Rich i18nKey="shop.spend.risesAlert" values={{ list: rises.map((r) => `${r.product_name} ${pct(r.delta)}`).join(', ') }} />
        </Alert>
      )}
    </>
  )
}

export function SpendDetail({ summary, products, orders, members, me, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const dh = useDh()
  const label = useCategoryLabel()
  const rows = spendByCategory(summary?.by_product, products)
  const lm = latestMonth(summary?.by_month)
  const extra = rebuy(summary?.by_product)
  const rises = priceRises(summary?.by_product)
  const items = buyerItems(orders)
  const bought = purchaseIndex(summary?.by_product)
  const never = products.filter((p) => !bought.has(p.id))
  const live = orders.filter((o) => o.status !== 'cancelled')
  const [pv, pu] = dh.parts(lm?.paid)
  const [ev, eu] = dh.parts(lm?.pending)

  return (
    <DetailFrame title={t('shop.spend.title')} sub={t('shop.spend.detailSub')} onClose={onClose} titleRef={titleRef}>
      <DetailColumns
        main={!rows.length ? <p className="text-sm text-gray-500">{t('shop.spend.empty')}</p> : (
          <>
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2.5">
              <h3 className="font-display text-[13.5px] font-bold">{t('shop.spend.byCategory')}</h3>
              <Legend items={[{ color: PAID, label: t('shop.spend.paid') }, { color: PENDING, label: t('shop.spend.pending') }]} />
            </div>
            <SpendChart rows={rows} labelOf={label} />
            <div className="mt-3.5 overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr>
                  <th className={TH}>{t('shop.spend.columns.buyer')}</th>
                  <th className={`${TH} hidden sm:table-cell`}>{t('shop.spend.columns.items')}</th>
                  <th className={`${TH} text-end`}>{t('shop.spend.columns.paid')}</th>
                  <th className={`${TH} text-end`}>{t('shop.spend.columns.pending')}</th>
                </tr></thead>
                <tbody>
                  {(summary?.by_buyer || []).map((b) => (
                    <tr key={b.buyer_id ?? 'none'} className="hover:bg-gray-50">
                      <td className={TD}>
                        <b className="font-semibold">{members.get(b.buyer_id) || t('shop.orders.memberUnknown', { id: b.buyer_id ?? '—' })}</b>
                        {b.buyer_id === me && <span className="text-gray-500"> {t('shop.orders.you')}</span>}
                      </td>
                      <td className={`${TD} hidden sm:table-cell`}>{(items.get(b.buyer_id) || []).map((i) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                      <td className={`${TD} whitespace-nowrap text-end tabular-nums`}>{b.paid ? dh(b.paid) : <span className="text-gray-400">–</span>}</td>
                      <td className={`${TD} whitespace-nowrap text-end tabular-nums`}>{b.pending ? <Chip tone="warn">{dh(b.pending)}</Chip> : <span className="text-gray-400">–</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        aside={<>
          {lm && (
            <>
              <h3 className="font-display text-[13px] font-bold">{fmtDate(monthDate(lm.month), { month: 'long', year: 'numeric' })}</h3>
              <div className="grid grid-cols-2 gap-3">
                <Kv label={t('shop.spend.paid')} value={pv} unit={pu} />
                <Kv label={t('shop.spend.pending')} value={ev} unit={eu} />
              </div>
            </>
          )}
          {extra.extra > 0 && (
            <Alert tone="info" icon={FiTag}>
              <Rich i18nKey="shop.spend.rebuyAlert" values={{
                count: extra.quantity, rising: extra.risingQuantity, amount: dh(extra.extra),
                list: rises.slice(0, 2).map((r) => t('shop.spend.fromTo', { name: r.product_name, from: dh(r.last_unit_price), to: dh(r.current_price) })).join(', '),
              }} />
            </Alert>
          )}
          {live.length > 0 && live.every((o) => !o.property_id) && (
            <Alert tone="plain" icon={FiHome}><Rich i18nKey="shop.spend.noPropertyAlert" /></Alert>
          )}
          {never.length > 0 && (
            <p className="m-0 text-[12.5px] text-gray-500">{t('shop.spend.neverOrdered', { count: never.length, list: never.map((p) => p.name).join(', ') })}</p>
          )}
        </>}
      />
    </DetailFrame>
  )
}
