import { Link } from 'react-router-dom'
import { fmtMAD, fmtNum, fmtPct } from '../../analytics/palette'

function Widget({ title, to, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        {to && <Link to={to} className="text-xs text-primary-600">voir plus →</Link>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// registry: id -> { title, render(overview) }
export const WIDGETS = {
  financial: { title: 'Finance', to: '/backoffice/analyses', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtMAD(o.financial?.revenue_realized)}</div>
      <div className="text-xs text-gray-400">Pipeline pondéré {fmtMAD(o.financial?.revenue_pipeline_weighted)}</div></div>) },
  pipeline: { title: 'Pipeline', to: '/backoffice/analyses/pipeline', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtMAD(o.pipeline?.pipeline_value_open)}</div>
      <div className="text-xs text-gray-400">{fmtNum(o.pipeline?.open_deals)} deals ouverts</div></div>) },
  hot_leads: { title: 'Leads', to: '/backoffice/leads', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtNum(o.hot_leads?.unread)}</div>
      <div className="text-xs text-red-500">{fmtNum(o.hot_leads?.overdue)} en retard</div></div>) },
  listings: { title: 'Annonces', to: '/dashboard/annonces', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtNum(o.listings?.active)}</div>
      <div className="text-xs text-gray-400">{fmtNum(o.listings?.views)} vues</div></div>) },
  market: { title: 'Marché', to: '/backoffice/analyses/marche', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtMAD(o.market?.portfolio_avg_price_sqm)}/m²</div>
      <div className="text-xs text-gray-400">{fmtNum(o.market?.avg_days_on_market)} j sur le marché</div></div>) },
  team_seats: { title: 'Équipe', to: '/backoffice/equipe', render: (o) => (
    <div><div className="text-2xl font-bold text-gray-900">{fmtNum(o.team?.members)}</div>
      <div className="text-xs text-gray-400">Sièges {o.seats?.used}/{o.seats?.limit === -1 ? '∞' : o.seats?.limit}</div></div>) },
  subscription: { title: 'Abonnement', to: '/dashboard/compte/abonnement', render: (o) => (
    <div><div className="text-lg font-bold text-gray-900">{o.subscription?.plan || '—'}</div>
      <div className="text-xs text-gray-400">{o.subscription?.status || ''}</div></div>) },
  alerts: { title: 'Alertes', to: null, render: (o) => (
    <ul className="space-y-1">{(o.alerts || []).length === 0 ? <li className="text-xs text-gray-400">Rien à signaler</li>
      : o.alerts.map((a, i) => <li key={i} className={`text-xs ${a.level === 'warning' ? 'text-amber-600' : 'text-gray-600'}`}>• {a.text}</li>)}</ul>) },
}

export { Widget }
