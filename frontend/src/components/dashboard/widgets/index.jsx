import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiArrowRight } from 'react-icons/fi'
import { fmtMAD, fmtNum, fmtPct } from '../../analytics/palette'
import DirIcon from '../../common/DirIcon'

// `titleKey` is the stable widget id, looked up in common:widgets.titles.<id>.
function Widget({ titleKey, to, children }) {
  const { t } = useTranslation(['common'])
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm">{t(`common:widgets.titles.${titleKey}`)}</h3>
        {to && (
          <Link to={to} className="text-xs text-primary-600 inline-flex items-center gap-1">
            {t('common:widgets.seeMore')} <DirIcon icon={FiArrowRight} className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// registry: id -> { to, render(overview) } — title is resolved from common:widgets.titles.<id> by Widget.
export const WIDGETS = {
  financial: { to: '/backoffice/analyses', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtMAD(o.financial?.revenue_realized)}</div>
      <div className="text-xs text-gray-400">Pipeline pondéré {fmtMAD(o.financial?.revenue_pipeline_weighted)}</div></div>) },
  pipeline: { to: '/backoffice/analyses/pipeline', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtMAD(o.pipeline?.pipeline_value_open)}</div>
      <div className="text-xs text-gray-400">{fmtNum(o.pipeline?.open_deals)} deals ouverts</div></div>) },
  hot_leads: { to: '/backoffice/leads', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtNum(o.hot_leads?.unread)}</div>
      <div className="text-xs text-red-500">{fmtNum(o.hot_leads?.overdue)} en retard</div></div>) },
  listings: { to: '/dashboard/annonces', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtNum(o.listings?.active)}</div>
      <div className="text-xs text-gray-400">{fmtNum(o.listings?.views)} vues</div></div>) },
  market: { to: '/backoffice/analyses/marche', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtMAD(o.market?.portfolio_avg_price_sqm)}/m²</div>
      <div className="text-xs text-gray-400">{fmtNum(o.market?.avg_days_on_market)} j sur le marché</div></div>) },
  team_seats: { to: '/backoffice/equipe', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtNum(o.team?.members)}</div>
      <div className="text-xs text-gray-400">Sièges {o.seats?.used}/{o.seats?.limit === -1 ? '∞' : o.seats?.limit}</div></div>) },
  subscription: { to: '/dashboard/compte/abonnement', render: (o) => (
    <div><div className="text-lg font-bold text-gray-900">{o.subscription?.plan || '—'}</div>
      <div className="text-xs text-gray-400">{o.subscription?.status || ''}</div></div>) },
  alerts: { to: null, render: (o) => <AlertsList alerts={o.alerts} /> },
}

function AlertsList({ alerts }) {
  const { t } = useTranslation(['common'])
  return (
    <ul className="space-y-1">{(alerts || []).length === 0 ? <li className="text-xs text-gray-400">{t('common:widgets.noAlerts')}</li>
      : alerts.map((a, i) => <li key={i} className={`text-xs ${a.level === 'warning' ? 'text-amber-600' : 'text-gray-600'}`}>• {a.text}</li>)}</ul>
  )
}

export { Widget }
