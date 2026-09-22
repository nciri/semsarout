import { useTranslation } from 'react-i18next'
import { ratio } from '../model'
import { useRentalFormat } from '../hooks'

function Cell({ label, value, unit, sub, tone }) {
  return (
    <div className="grid content-start gap-[3px] border-gray-200 px-4 py-3.5 sm:px-[18px]">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className={`font-display text-[19px] font-extrabold tabular-nums sm:text-[22px] ${tone === 'crit' ? 'text-red-700' : ''}`}>
        {value}{unit && <small className="ms-1 text-[12.5px] font-bold text-gray-600">{unit}</small>}
      </span>
      <span className="text-xs text-gray-500">{sub}</span>
    </div>
  )
}

/** Bande de synthèse : encaissé du mois, impayés, occupation, honoraires. */
export default function SummaryBand({ s }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const month = f.month(s.year, s.month_number, { month: 'long' })
  const dh = t('dashboard.units.dirham')
  const occ = ratio(s.occupancy.leased, s.occupancy.managed)

  return (
    <div className="grid grid-cols-2 rounded-xl border border-gray-200 bg-white lg:grid-cols-4 [&>*:nth-child(-n+2)]:border-b lg:[&>*:nth-child(-n+2)]:border-b-0 [&>*]:border-e [&>*:nth-child(2)]:border-e-0 lg:[&>*:nth-child(2)]:border-e [&>*:last-child]:border-e-0">
      <Cell label={t('rental.overview.kpi.collected', { month })} value={f.n(s.month.collected)} unit={dh}
        sub={s.month.count
          ? t('rental.overview.kpi.collectedOf', { amount: f.dh(s.month.expected), rate: f.pct(ratio(s.month.collected, s.month.expected)) })
          : t('rental.overview.kpi.noDueThisMonth')} />
      <Cell label={t('rental.overview.kpi.arrears')} value={f.n(s.arrears.total)} unit={dh} tone={s.arrears.total > 0 ? 'crit' : null}
        sub={s.arrears.periods
          ? t('rental.overview.kpi.arrearsSub', { count: s.arrears.periods, leases: t('rental.overview.leaseCount', { count: s.arrears.leases }) })
          : t('rental.overview.kpi.noArrears')} />
      <Cell label={t('rental.overview.kpi.occupancy')} value={f.pct(occ)}
        sub={t('rental.overview.kpi.occupancySub', { count: s.occupancy.managed, leased: s.occupancy.leased })} />
      <Cell label={t('rental.overview.kpi.fees', { month })} value={f.n(s.fees.month)} unit={dh} sub={t('rental.overview.kpi.feesSub')} />
    </div>
  )
}
