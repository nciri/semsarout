import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiArrowUpRight, FiChevronDown, FiTruck } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { IconAction, Segmented } from '../components/kit'
import OrderBody, { StatusChip } from './OrderBody'
import { ORDER_FILTERS } from './model'
import { useDh } from './useShop'

const COLS = 'grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center md:grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_110px_130px]'

/** Suivi des commandes de l'agence : filtre par statut, ligne dépliable par commande. */
export default function OrdersTracking({ orders = [], members, propertiesById, me, isLoading, now = new Date(), id = 'orders' }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const dh = useDh()
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(() => new Set())
  const list = orders.filter(ORDER_FILTERS[filter])
  const toggle = (oid) => setOpen((s) => { const n = new Set(s); if (n.has(oid)) n.delete(oid); else n.add(oid); return n })
  const who = (o) => members.get(o.buyer_id) || t('shop.orders.memberUnknown', { id: o.buyer_id ?? '—' })

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid min-w-0 scroll-mt-4 gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="flex items-center gap-2 font-display text-base font-bold">
            <FiTruck className="h-[18px] w-[18px] text-gray-400" aria-hidden="true" />{t('shop.orders.title')}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">{t('shop.orders.sub')}</p>
        </div>
        <Segmented
          label={t('shop.orders.filterLabel')}
          value={filter}
          onChange={setFilter}
          options={Object.keys(ORDER_FILTERS).map((k) => ({
            value: k,
            label: <>{t(`shop.orders.filters.${k}`)}<span className="ms-1 font-semibold tabular-nums text-gray-500">{orders.filter(ORDER_FILTERS[k]).length}</span></>,
          }))}
        />
      </div>

      {isLoading ? <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" /> : !list.length ? (
        <p className="rounded-lg border border-dashed border-gray-200 p-7 text-center text-sm text-gray-500">
          {orders.length ? t('shop.orders.emptyFilter') : t('shop.orders.empty')}
        </p>
      ) : (
        <div>
          <div aria-hidden="true" className={`${COLS} hidden px-2 pb-2 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500 md:grid`}>
            <span /><span>{t('shop.orders.columns.reference')}</span><span>{t('shop.orders.columns.buyer')}</span>
            <span>{t('shop.orders.columns.delivery')}</span><span className="text-end">{t('shop.orders.columns.total')}</span><span>{t('shop.orders.columns.status')}</span>
          </div>
          {list.map((o) => {
            const isOpen = open.has(o.id)
            const property = o.property_id ? propertiesById.get(o.property_id) : null
            const count = (o.items || []).reduce((n, it) => n + it.quantity, 0) || o.items_count
            return (
              <div key={o.id} className="border-t border-gray-100">
                <div onClick={() => toggle(o.id)} className={`${COLS} cursor-pointer rounded-lg px-2 py-2.5 text-sm ${isOpen ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                  <IconAction icon={FiChevronDown} label={t('shop.orders.toggle', { reference: o.reference })}
                    aria-expanded={isOpen} aria-controls={`od-${o.id}`} tipAlign="center"
                    onClick={(e) => { e.stopPropagation(); toggle(o.id) }}
                    className={`-m-1 p-1 [&>svg]:transition-transform motion-reduce:[&>svg]:transition-none ${isOpen ? '[&>svg]:rotate-180' : ''}`} />
                  <span className="min-w-0">
                    <span className="font-mono text-[13px] font-semibold">{o.reference}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {fmtDate(o.created_at, { day: 'numeric', month: 'long' })} · {t('shop.orders.items', { count })}
                    </span>
                  </span>
                  <span className="min-w-0 truncate max-md:col-span-2 max-md:col-start-2">
                    {who(o)}{o.buyer_id === me && <span className="text-gray-500"> {t('shop.orders.you')}</span>}
                  </span>
                  <span className="min-w-0 max-md:col-span-2 max-md:col-start-2">
                    <span className="block truncate">{o.delivery_address || t('shop.orders.noAddress')}</span>
                    <span className="block truncate text-xs text-gray-500">{property ? (property.title || property.reference) : t('shop.orders.noProperty')}</span>
                  </span>
                  <span className="text-end font-semibold tabular-nums max-md:col-start-3 max-md:row-start-1">{dh(o.total)}</span>
                  <span className="justify-self-start max-md:col-span-2 max-md:col-start-2"><StatusChip status={o.status} /></span>
                </div>
                {isOpen && (
                  <div id={`od-${o.id}`} className="px-2 pb-4 pt-3.5 md:ps-[52px]">
                    <OrderBody order={o} property={property} now={now} />
                    <div className="mt-2 flex justify-end">
                      <IconAction icon={FiArrowUpRight} to={`/backoffice/mes-commandes/${o.id}`} tone="gold" tipAlign="end" label={t('shop.orders.open', { reference: o.reference })} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
