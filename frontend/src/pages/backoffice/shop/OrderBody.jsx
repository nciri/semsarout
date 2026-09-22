import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiHash, FiHome, FiMapPin, FiXCircle } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, IconAction, Rich } from '../components/kit'
import { FLOW, daysSince, hasRetired, isRetired, priceDelta, stepStates } from './model'
import { useDh, useShopActions } from './useShop'

const STATUS_TONE = { pending: 'warn', paid: 'neutral', preparing: 'neutral', shipped: 'neutral', delivered: 'good', cancelled: 'crit' }

export function StatusChip({ status }) {
  const { t } = useTranslation('backoffice')
  return <Chip tone={STATUS_TONE[status] || 'neutral'}>{t(`shop.status.${status}`, { defaultValue: status })}</Chip>
}

function Steps({ status }) {
  const { t } = useTranslation('backoffice')
  const states = stepStates(status)
  return (
    <ol aria-label={t('shop.orders.progress', { status: t(`shop.status.${status}`) })}
      className="m-0 grid list-none grid-cols-5 p-0 text-center text-[10.5px] text-gray-500 sm:text-[11.5px]">
      {FLOW.map((s, i) => (
        <li key={s} className={`relative grid justify-items-center gap-1.5 ${states[i] === 'now' ? 'font-semibold text-gray-900' : ''}`}>
          {i > 0 && <span aria-hidden="true" className={`absolute end-1/2 top-2 h-0.5 w-full ${states[i] === 'todo' ? 'bg-gray-200' : 'bg-green-700'}`} />}
          <span aria-hidden="true" className={`relative grid h-[18px] w-[18px] place-items-center rounded-full border-2 ${
            states[i] === 'done' ? 'border-green-700 bg-green-700' : states[i] === 'now' ? 'border-primary-400 bg-white shadow-[0_0_0_3px] shadow-primary-50' : 'border-gray-200 bg-white'
          }`}>
            {states[i] === 'done' && <span className="h-2 w-[5px] -translate-y-px rotate-45 border-b-2 border-e-2 border-white" />}
          </span>
          {t(`shop.steps.${s}`)}
          <span className="sr-only">{t(`shop.stepState.${states[i]}`)}</span>
        </li>
      ))}
    </ol>
  )
}

/** Détail d'une commande : lignes (avec l'écart au prix actuel), avancement, livraison, paiement. */
export default function OrderBody({ order: o, property, now = new Date() }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate, fmtNumber } = useFormat()
  const dh = useDh()
  const { pay, cancel } = useShopActions()
  const retired = hasRetired(o)
  const pct = (d) => fmtNumber(d, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'always' })
  const confirmCancel = () => { if (window.confirm(t('shop.orders.cancelConfirm', { reference: o.reference }))) cancel.mutate(o.id) }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <ul className="m-0 grid min-w-0 list-none p-0">
        {(o.items || []).map((it) => (
          <li key={it.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
            <span className="min-w-0"><b className="font-semibold">{it.product_name}</b> <span className="text-gray-500">× {it.quantity}</span></span>
            <span className="text-end font-semibold tabular-nums">{dh(it.line_total)}</span>
            <span className="col-span-2 text-[12.5px] text-gray-500">
              {t('shop.orders.unit', { amount: dh(it.unit_price) })} · {isRetired(it)
                ? <Chip tone="crit">{t('shop.orders.retired')}</Chip>
                : it.current_price == null ? null
                  : it.current_price !== it.unit_price
                    ? t('shop.orders.priceNow', { amount: dh(it.current_price), delta: pct(priceDelta(it.current_price, it.unit_price)) })
                    : t('shop.orders.priceSame')}
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-gray-200 py-2 font-bold">
          <span>{t('shop.orders.total')}</span><span className="text-end tabular-nums">{dh(o.total)}</span>
        </li>
      </ul>
      <div className="grid min-w-0 content-start gap-3.5">
        {o.status === 'cancelled' ? <StatusChip status="cancelled" /> : <Steps status={o.status} />}
        <div className="grid gap-1.5 text-[12.5px] text-gray-600">
          <span className="flex items-start gap-2"><FiMapPin className="mt-0.5 h-[15px] w-[15px] flex-none text-gray-400" aria-hidden="true" />{o.delivery_address || t('shop.orders.noAddress')}</span>
          <span className="flex items-start gap-2"><FiHome className="mt-0.5 h-[15px] w-[15px] flex-none text-gray-400" aria-hidden="true" />{property ? (property.title || property.reference) : t('shop.orders.noProperty')}</span>
          <span className="flex items-start gap-2"><FiHash className="mt-0.5 h-[15px] w-[15px] flex-none text-gray-400" aria-hidden="true" />
            {o.payment_reference
              ? t('shop.orders.paidRef', { reference: o.payment_reference, date: fmtDate(o.paid_at, { day: 'numeric', month: 'long' }) })
              : o.status === 'pending' ? t('shop.orders.waiting', { count: Math.max(0, daysSince(o.created_at, now)) })
                : t('shop.orders.noPayment')}
          </span>
        </div>
        {o.status === 'pending' && retired && (
          <Alert tone="crit" icon={FiAlertCircle}><Rich i18nKey="shop.orders.retiredAlert" /></Alert>
        )}
        {o.status === 'pending' && (
          <div className="flex flex-wrap items-center gap-2">
            {!retired && (
              <button type="button" onClick={() => pay.mutate(o.id)} disabled={pay.isLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-primary-400 bg-primary-400 px-3.5 py-2 text-[13.5px] font-semibold text-[#241906] hover:bg-primary-600 disabled:opacity-50">
                {t('shop.orders.pay', { amount: dh(o.total) })}
              </button>
            )}
            <IconAction icon={FiXCircle} tone="danger" label={t('shop.orders.cancel')} onClick={confirmCancel}
              disabled={cancel.isLoading} className="border border-red-100" />
          </div>
        )}
      </div>
    </div>
  )
}
