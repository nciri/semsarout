import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { adminService } from '../../services/adminService'

function Kpi({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-midnight mt-1">{value}</div>
    </div>
  )
}

function AdminOverview() {
  const { t } = useTranslation(['admin', 'common'])
  const { data, isLoading } = useQuery(['admin', 'overview'], adminService.getOverview)
  if (isLoading) return <p>{t('admin:shared.loading')}</p>
  const d = data || {}
  const subs = Object.entries(d.active_subscriptions || {})
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">{t('admin:overview.title')}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label={t('admin:overview.kpi.users')} value={d.total_users} />
        <Kpi label={t('admin:overview.kpi.agencies')} value={d.total_agencies} />
        <Kpi label={t('admin:overview.kpi.mrrEstimate')} value={d.mrr_estimate} />
        <Kpi label={t('admin:overview.kpi.signups30d')} value={d.signups_last_30d} />
        <Kpi label={t('admin:overview.kpi.suspended')} value={d.suspended_count} />
        <Kpi label={t('admin:overview.kpi.pendingPurge')} value={d.deleted_pending_purge_count} />
      </div>
      <h2 className="text-lg font-semibold text-midnight mt-8 mb-3">{t('admin:overview.activeSubscriptions')}</h2>
      <div className="flex gap-4">
        {subs.length === 0 && <p className="text-slate-500">{t('admin:overview.none')}</p>}
        {subs.map(([plan, count]) => <Kpi key={plan} label={plan} value={count} />)}
      </div>
    </div>
  )
}

export default AdminOverview
