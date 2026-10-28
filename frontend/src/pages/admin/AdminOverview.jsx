import { useMutation, useQuery } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiPlay } from 'react-icons/fi'
import { adminService } from '../../services/adminService'
import { useFormat } from '../../utils/format'

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
  const { fmtDate } = useFormat()
  const { data, isLoading } = useQuery(['admin', 'overview'], adminService.getOverview)
  const { data: journal, refetch: refetchJournal } = useQuery(['admin', 'notifications'],
    () => adminService.getNotifications(50))
  const runScheduler = useMutation(adminService.runScheduler, {
    onSuccess: () => { toast.success(t('admin:overview.scheduler.done')); refetchJournal() },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  if (isLoading) return <p>{t('admin:shared.loading')}</p>
  const d = data || {}
  const subs = Object.entries(d.active_subscriptions || {})
  const incidents = d.payment_incidents || []
  const sent = journal?.notifications || []
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">{t('admin:overview.title')}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label={t('admin:overview.kpi.users')} value={d.total_users} />
        <Kpi label={t('admin:overview.kpi.agencies')} value={d.total_agencies} />
        <Kpi label={t('admin:overview.kpi.mrrEstimate')} value={d.mrr_estimate} />
        <Kpi label={t('admin:overview.kpi.arrEstimate')} value={d.arr_estimate} />
        <Kpi label={t('admin:overview.kpi.signups30d')} value={d.signups_last_30d} />
        <Kpi label={t('admin:overview.kpi.suspended')} value={d.suspended_count} />
        <Kpi label={t('admin:overview.kpi.pendingPurge')} value={d.deleted_pending_purge_count} />
        <Kpi label={t('admin:overview.kpi.pastDue')} value={d.unpaid_subscriptions?.past_due ?? 0} />
        <Kpi label={t('admin:overview.kpi.restricted')} value={d.unpaid_subscriptions?.restricted ?? 0} />
      </div>
      <h2 className="text-lg font-semibold text-midnight mt-8 mb-3">{t('admin:overview.activeSubscriptions')}</h2>
      <div className="flex gap-4">
        {subs.length === 0 && <p className="text-slate-500">{t('admin:overview.none')}</p>}
        {subs.map(([plan, count]) => <Kpi key={plan} label={plan} value={count} />)}
      </div>

      {/* Incidents de paiement : le motif rendu par la passerelle, pour rappeler l'agence
          avant que ses droits tombent. */}
      <h2 className="text-lg font-semibold text-midnight mt-8 mb-3">{t('admin:overview.incidents.title')}</h2>
      {incidents.length === 0 ? (
        <p className="text-slate-500">{t('admin:overview.incidents.none')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-start text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-start">{t('admin:overview.incidents.columns.agency')}</th>
                <th className="px-4 py-2 text-start">{t('admin:overview.incidents.columns.plan')}</th>
                <th className="px-4 py-2 text-start">{t('admin:overview.incidents.columns.status')}</th>
                <th className="px-4 py-2 text-start">{t('admin:overview.incidents.columns.amount')}</th>
                <th className="px-4 py-2 text-start">{t('admin:overview.incidents.columns.grace')}</th>
                <th className="px-4 py-2 text-start">{t('admin:overview.incidents.columns.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((x) => (
                <tr key={x.subscription_id} className="border-t border-slate-100">
                  <td className="px-4 py-2">#{x.agency_id}</td>
                  <td className="px-4 py-2">{x.plan || '—'}</td>
                  <td className="px-4 py-2">{t(`admin:overview.incidents.status.${x.status}`, { defaultValue: x.status })}</td>
                  <td className="px-4 py-2 tabular-nums">{x.amount}</td>
                  <td className="px-4 py-2">{x.grace_until ? fmtDate(x.grace_until, { day: 'numeric', month: 'short' }) : '—'}</td>
                  <td className="px-4 py-2">{x.last_failure_reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tâches planifiées : les rejouer sans attendre le prochain réveil de l'ordonnanceur. */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-midnight">{t('admin:overview.scheduler.title')}</h2>
        <button
          type="button"
          onClick={() => runScheduler.mutate()}
          disabled={runScheduler.isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-midnight px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <FiPlay className="h-4 w-4" aria-hidden="true" />
          {t('admin:overview.scheduler.run')}
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t('admin:overview.scheduler.help')}</p>

      <h2 className="text-lg font-semibold text-midnight mt-8 mb-3">
        {t('admin:overview.journal.title', { failed: journal?.failed ?? 0 })}
      </h2>
      {sent.length === 0 ? (
        <p className="text-slate-500">{t('admin:overview.journal.none')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-start">{t('admin:overview.journal.columns.date')}</th>
                <th className="px-4 py-2 text-start">{t('admin:overview.journal.columns.channel')}</th>
                <th className="px-4 py-2 text-start">{t('admin:overview.journal.columns.recipient')}</th>
                <th className="px-4 py-2 text-start">{t('admin:overview.journal.columns.template')}</th>
                <th className="px-4 py-2 text-start">{t('admin:overview.journal.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {sent.map((n) => (
                <tr key={n.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{n.created_at ? fmtDate(n.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-2">{n.channel}</td>
                  <td className="px-4 py-2">{n.recipient}</td>
                  <td className="px-4 py-2">{n.template}</td>
                  <td className={`px-4 py-2 ${n.status === 'failed' ? 'text-red-700' : 'text-slate-600'}`}>
                    {t(`admin:overview.journal.status.${n.status}`, { defaultValue: n.status })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminOverview
