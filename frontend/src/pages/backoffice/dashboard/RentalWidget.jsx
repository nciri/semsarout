import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi'
import { useFormat } from '../../../utils/format'
import { Alert, Chip, DetailColumns, DetailFrame, Figure, Kv, TD, TH } from '../components/kit'
import { useMoney } from '../components/kitTokens'

/** Ce qui, dans la gestion locative, demande une action aujourd'hui. */
function rentalAlerts(summary) {
  const inventories = (summary?.inventories?.items || []).filter((i) => !i.entry_signed)
  const arrears = summary?.arrears?.leases || 0
  const expiring = (summary?.expiring?.items || []).length
  const applications = (summary?.applications?.pending || []).length
  return {
    arrears,
    arrearsAmount: summary?.arrears?.total || 0,
    expiring,
    applications,
    inventories: inventories.length,
    total: arrears + expiring + applications + inventories.length,
  }
}

export function RentalCompact({ summary }) {
  const { t } = useTranslation('backoffice')
  const money = useMoney()
  const a = rentalAlerts(summary)

  return (
    <>
      <Figure value={a.total}>{t('dashboard.rental.headline', { count: a.total })}</Figure>
      <div className="grid grid-cols-2 gap-3">
        <Kv label={t('dashboard.rental.arrears')} value={a.arrears}
          sub={a.arrearsAmount ? money(a.arrearsAmount, 'sale') : null} />
        <Kv label={t('dashboard.rental.applications')} value={a.applications} />
        <Kv label={t('dashboard.rental.expiring')} value={a.expiring} />
        <Kv label={t('dashboard.rental.inventories')} value={a.inventories} />
      </div>
      {a.total === 0 && <Alert tone="plain" icon={FiCheckCircle}>{t('dashboard.rental.allClear')}</Alert>}
    </>
  )
}

export function RentalDetail({ summary, onClose, titleRef }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const money = useMoney()
  const a = rentalAlerts(summary)
  const arrears = (summary?.arrears?.items || []).slice(0, 8)
  const expiring = (summary?.expiring?.items || []).slice(0, 8)
  const applications = (summary?.applications?.pending || []).slice(0, 8)

  return (
    <DetailFrame
      title={t('dashboard.rental.title')}
      sub={t('dashboard.rental.detailSub')}
      link={{ to: '/backoffice/gestion-locative', label: t('dashboard.rental.viewAll') }}
      onClose={onClose}
      titleRef={titleRef}
    >
      <DetailColumns
        main={arrears.length === 0 ? <p className="text-sm text-gray-500">{t('dashboard.rental.noArrears')}</p> : (
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={TH}>{t('dashboard.rental.columns.tenant')}</th>
              <th className={TH}>{t('dashboard.rental.columns.property')}</th>
              <th className={`${TH} text-end`}>{t('dashboard.rental.columns.due')}</th>
              <th className={`${TH} text-end`}>{t('dashboard.rental.columns.age')}</th>
            </tr></thead>
            <tbody>
              {arrears.map((i) => (
                <tr key={i.period_id} className="hover:bg-gray-50">
                  <td className={TD}>{i.tenant_name || '—'}</td>
                  <td className={TD}>{i.property_title || '—'}<span className="block text-xs text-gray-500">{i.lease_reference}</span></td>
                  <td className={`${TD} text-end tabular-nums`}>{money(i.rest, 'sale')}</td>
                  <td className={`${TD} text-end`}><Chip tone={i.age_days > 45 ? 'crit' : 'warn'}>{t('dashboard.units.days', { count: i.age_days })}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        aside={<>
          {a.arrearsAmount > 0 && (
            <Alert tone="crit" icon={FiAlertTriangle}>
              {t('dashboard.rental.arrearsAlert', { amount: money(a.arrearsAmount, 'sale'), count: a.arrears })}
            </Alert>
          )}
          <h3 className="font-display text-[13px] font-bold">{t('dashboard.rental.applications')}</h3>
          {applications.length === 0
            ? <p className="text-[13px] text-gray-500">{t('dashboard.rental.noApplications')}</p>
            : (
              <ul className="grid gap-1.5 text-[13px]">
                {applications.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span className="truncate">{p.applicant_name || `#${p.id}`}</span>
                    <span className="text-gray-500">{t('dashboard.units.days', { count: p.age_days || 0 })}</span>
                  </li>
                ))}
              </ul>
            )}
          <h3 className="font-display text-[13px] font-bold">{t('dashboard.rental.expiring')}</h3>
          {expiring.length === 0
            ? <p className="text-[13px] text-gray-500">{t('dashboard.rental.noExpiring')}</p>
            : (
              <ul className="grid gap-1.5 text-[13px]">
                {expiring.map((i) => (
                  <li key={`${i.kind}-${i.id}`} className="flex justify-between gap-3">
                    <span className="truncate">{i.property_title || i.reference}</span>
                    <span className="text-gray-500">{i.end_date ? fmtDate(i.end_date, { day: 'numeric', month: 'short' }) : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
        </>}
      />
    </DetailFrame>
  )
}
