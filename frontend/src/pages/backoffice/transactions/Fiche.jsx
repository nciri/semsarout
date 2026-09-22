import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiFileText } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, SegBar } from '../components/kit'
import { TONE_COLORS, useMoney } from '../components/kitTokens'
import { milestones, probabilityTone } from './model'

function Block({ title, children }) {
  return (
    <div className="grid content-start gap-2">
      <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 text-end font-medium tabular-nums">{children}</dd>
    </div>
  )
}

const linkCls = 'text-gray-900 underline decoration-gray-300 underline-offset-2 hover:text-primary-700 hover:decoration-primary-400'

/** Fiche dépliée sous une ligne du registre : tout ce qu'il faut pour relancer l'affaire sans quitter la liste. */
export default function Fiche({ tx, overdue }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const money = useMoney()
  const f = (key, opts) => t(`crm.transactions.list.fiche.${key}`, opts)
  const none = f('none')
  const price = (v) => (v != null ? money(v, tx.transaction_type) : none)
  const p = tx.probability
  const commission = tx.expected_commission

  return (
    <div className="grid gap-5 px-1 py-2">
      {tx.status === 'lost' && (
        <Alert tone="crit" icon={FiAlertCircle}>
          {tx.lost_reason ? t('crm.transactions.list.lostReason', { reason: tx.lost_reason }) : t('crm.transactions.list.lostReasonNone')}
        </Alert>
      )}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <Block title={f('parties')}>
          <dl className="grid gap-1.5">
            <Row label={f('property')}>
              <Link to={`/backoffice/biens/${tx.property_id}`} className={linkCls}>{tx.property_title || `#${tx.property_id}`}</Link>
            </Row>
            <Row label={f('client')}>
              {tx.client_id ? <Link to={`/backoffice/clients/${tx.client_id}`} className={linkCls}>{tx.client_name || `#${tx.client_id}`}</Link> : none}
            </Row>
            <Row label={f('seller')}>
              {tx.seller_id ? <Link to={`/backoffice/clients/${tx.seller_id}`} className={linkCls}>{tx.seller_name || `#${tx.seller_id}`}</Link> : none}
            </Row>
            <Row label={f('agent')}>{tx.agent_name || none}</Row>
            <Row label={f('stage')}>{t(`crm.transactions.stage.${tx.stage}`, { defaultValue: tx.stage })}</Row>
          </dl>
        </Block>

        <Block title={f('amounts')}>
          <dl className="grid gap-1.5">
            <Row label={f('asking')}>{price(tx.asking_price)}</Row>
            <Row label={f('offer')}>{price(tx.offer_price)}</Row>
            <Row label={f('final')}>{price(tx.final_price)}</Row>
          </dl>
        </Block>

        <Block title={f('probability')}>
          {p != null ? (
            <div className="grid gap-1.5">
              <span className="font-display text-xl font-extrabold tabular-nums">{p} %</span>
              <SegBar label={`${f('probability')} ${p} %`} parts={[{ value: p, color: TONE_COLORS[probabilityTone(p)] }, { value: 100 - p, color: '#E5E7EB' }]} />
            </div>
          ) : <span className="text-[13px] text-gray-500">{none}</span>}
          <h4 className="mt-2 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">{f('commission')}</h4>
          <div className="grid gap-0.5 text-[13px]">
            <span className="font-semibold tabular-nums">
              {commission != null ? money(commission, 'sale') : none}
              {commission != null && tx.status !== 'lost' && (
                <span className="ms-1.5 font-normal text-gray-500">{f(tx.status === 'won' ? 'commissionSigned' : 'commissionExpected')}</span>
              )}
            </span>
            {tx.commission_rate != null && <span className="text-gray-500">{f('commissionRate', { rate: tx.commission_rate })}</span>}
          </div>
        </Block>

        <Block title={f('milestones')}>
          <ol className="grid gap-1.5">
            {milestones(tx).map((m) => (
              <li key={m.key} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className={m.planned ? 'text-gray-500' : 'text-gray-700'}>{t(`crm.transactions.list.milestone.${m.key}`)}</span>
                <span className="whitespace-nowrap tabular-nums font-medium">
                  {m.planned && overdue ? <Chip tone="warn">{fmtDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })}</Chip>
                    : fmtDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </li>
            ))}
          </ol>
        </Block>
      </div>
      {tx.notes && (
        <p className="flex items-start gap-2 text-[13px] text-gray-600">
          <FiFileText className="mt-0.5 h-4 w-4 flex-none text-gray-400" aria-hidden="true" />
          <span className="sr-only">{f('notes')}</span>{tx.notes}
        </p>
      )}
    </div>
  )
}
