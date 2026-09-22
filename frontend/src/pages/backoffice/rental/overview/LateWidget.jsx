import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiCheckCircle, FiDollarSign, FiExternalLink, FiInfo } from 'react-icons/fi'
import { Alert, DetailColumns, DetailFrame, Figure, Kv, Legend, Rich, SegBar, TD, TH, IconAction } from '../../components/kit'
import { TONE_COLORS } from '../../components/kitTokens'
import { arrearsByLease, ratio } from '../model'
import { AgeChip, PayModal } from '../parts'
import { useRentalFormat } from '../hooks'

const BUCKETS = [['lt15', TONE_COLORS.good], ['d15_45', TONE_COLORS.warn], ['gt45', TONE_COLORS.crit]]

export function LateCompact({ s }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const a = s.arrears
  if (!a.periods) return <Alert tone="plain" icon={FiCheckCircle}>{t('rental.overview.late.none')}</Alert>
  const byLease = arrearsByLease(a.items)
  return (
    <>
      <Figure value={f.n(a.total)} unit={t('dashboard.units.dirham')}>{t('rental.overview.late.owedBy', { count: byLease.length })}</Figure>
      <div className="grid gap-2">
        <SegBar label={t('rental.overview.late.agingLabel', { lt15: f.dh(a.buckets.lt15), d15_45: f.dh(a.buckets.d15_45), gt45: f.dh(a.buckets.gt45) })}
          parts={BUCKETS.map(([k, color]) => ({ value: a.buckets[k], color }))} />
        <Legend items={BUCKETS.map(([k, color]) => ({ color, label: `${t(`rental.overview.late.buckets.${k}`)} · ${f.n(a.buckets[k])}` }))} />
      </div>
      <ul aria-label={t('rental.overview.late.listLabel')} className="grid">
        {byLease.slice(0, 3).map((g) => (
          <li key={g.lease_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 border-t border-gray-100 py-2 first:border-t-0 first:pt-0">
            <b className="truncate font-semibold">{g.tenant_name || g.lease_reference} · {f.dh(g.owed)}</b>
            <span className="row-span-2 self-center"><AgeChip days={g.age} /></span>
            <span className="truncate text-[12.5px] text-gray-500">{[g.property_title, g.property_city].filter(Boolean).join(', ')}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

export function LateDetail({ s, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const [payFor, setPayFor] = useState(null)
  const a = s.arrears
  const multi = arrearsByLease(a.items).find((g) => g.count > 1)

  return (
    <DetailFrame title={t('rental.overview.late.title')}
      sub={a.periods ? t('rental.overview.late.detailSub', { count: a.periods }) : t('rental.overview.late.none')}
      link={{ to: '/backoffice/gestion-locative/baux', label: t('rental.overview.late.viewLeases') }}
      onClose={onClose} titleRef={titleRef}>
      {!a.periods ? <p className="text-sm text-gray-500">{t('rental.overview.late.none')}</p> : (
        <DetailColumns
          main={
            <table className="w-full text-[13px]">
              <thead><tr>
                <th className={TH}>{t('rental.overview.late.columns.tenant')}</th>
                <th className={TH}>{t('rental.overview.late.columns.month')}</th>
                <th className={`${TH} text-end`}>{t('rental.overview.late.columns.rest')}</th>
                <th className={`${TH} text-end`}>{t('rental.overview.late.columns.reminders')}</th>
                <th className={`${TH} text-end`}>{t('rental.overview.late.columns.age')}</th>
                <th className={`${TH} text-end`}><span className="sr-only">{t('rental.overview.actions')}</span></th>
              </tr></thead>
              <tbody>
                {a.items.map((i) => (
                  <tr key={i.period_id} className="hover:bg-gray-50">
                    <td className={TD}>
                      <b className="font-semibold">{i.tenant_name || i.lease_reference}</b>
                      <span className="block text-xs text-gray-500">{[i.property_title, i.property_city].filter(Boolean).join(', ')}</span>
                    </td>
                    <td className={`${TD} capitalize`}>
                      {f.month(i.year, i.month)}
                      {i.paid_amount > 0 && <span className="block text-xs normal-case text-gray-500">{t('rental.overview.late.partPaid', { amount: f.n(i.paid_amount) })}</span>}
                    </td>
                    <td className={`${TD} text-end tabular-nums`}><b>{f.n(i.rest)}</b></td>
                    <td className={`${TD} text-end tabular-nums`}>{i.reminder_count}</td>
                    <td className={`${TD} text-end`}><AgeChip days={i.age_days} /></td>
                    <td className={`${TD} whitespace-nowrap text-end`}>
                      <IconAction icon={FiDollarSign} label={t('rental.overview.lease.recordPayment')} tone="gold"
                        onClick={() => setPayFor({ id: i.period_id, period_label: i.period_label, rest: i.rest })} />
                      <IconAction icon={FiExternalLink} label={t('rental.overview.openLease')} to={`/backoffice/gestion-locative/baux/${i.lease_id}`} tipAlign="end" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          aside={<>
            <div className="grid grid-cols-2 gap-3">
              <Kv label={t('rental.overview.late.total')} value={f.n(a.total)} unit={t('dashboard.units.dirham')} />
              <Kv label={t('rental.overview.late.share')} value={f.pct(ratio(a.total, s.month.expected))}
                sub={t('rental.overview.late.shareSub')} />
            </div>
            {multi && <Alert tone="crit" icon={FiAlertCircle}><Rich i18nKey="rental.overview.late.multiAlert" values={{ name: multi.tenant_name || multi.lease_reference, count: multi.count, amount: f.dh(multi.owed) }} /></Alert>}
            <Alert tone="plain" icon={FiInfo}>{t('rental.overview.late.reminderRule')}</Alert>
          </>}
        />
      )}
      {payFor && <PayModal period={payFor} onClose={() => setPayFor(null)} />}
    </DetailFrame>
  )
}
