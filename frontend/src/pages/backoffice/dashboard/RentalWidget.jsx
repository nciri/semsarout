import { useTranslation } from 'react-i18next'
import { FiCheckCircle } from 'react-icons/fi'
import { Alert, Figure, Kv } from '../components/kit'
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
          sub={a.arrearsAmount ? money(a.arrearsAmount, 'sale') : null}
          to="/backoffice/gestion-locative/baux?filtre=impayes" />
        <Kv label={t('dashboard.rental.applications')} value={a.applications}
          to="/backoffice/gestion-locative/candidatures?statut=pending" />
        <Kv label={t('dashboard.rental.expiring')} value={a.expiring}
          to="/backoffice/gestion-locative/baux?filtre=echeances" />
        <Kv label={t('dashboard.rental.inventories')} value={a.inventories}
          to="/backoffice/gestion-locative/baux?filtre=edl_manquant" />
      </div>
      {a.total === 0 && <Alert tone="plain" icon={FiCheckCircle}>{t('dashboard.rental.allClear')}</Alert>}
    </>
  )
}
