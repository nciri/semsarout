import { useMemo } from 'react'
import { useQuery } from 'react-query'
import {
  FiTrendingUp, FiTrendingDown, FiDollarSign, FiUsers,
  FiCalendar, FiBarChart2, FiDownload
} from 'react-icons/fi'
import { formatPrice } from '../../../utils/currency'
import { analyticsService } from '../../../services/analyticsService'
import { useFilters } from './AnalyticsLayout'
import api from '../../../services/api'

const TX_TYPE_LABELS = { sale: 'Vente', rent: 'Location', autre: 'Autre' }

// Les endpoints stats/* raisonnent en jours (param `period`) ; les endpoints
// analytics/* en plages nommées (`range`). On dérive l'un de l'autre.
const rangeToDays = (r) => {
  if (r === '30d') return 30
  if (r === '90d') return 90
  if (r === '12m') return 365
  if (r === 'ytd') {
    const now = new Date()
    return Math.max(1, Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / 86400000))
  }
  return 90
}

const backofficeService = {
  getStats: async (params) => (await api.get('/backoffice/stats/overview', { params })).data,
  getAgentPerformance: async (params) => (await api.get('/backoffice/stats/agent-performance', { params })).data,
  getPropertiesByCity: async () => (await api.get('/backoffice/stats/properties-by-city')).data,
  exportCsv: async (type) => (await api.get('/backoffice/stats/export', { params: { type }, responseType: 'blob' })).data,
}

function StatCard({ title, value, change, icon: Icon, color = 'primary', loading }) {
  const isPositive = change >= 0
  const colorClasses = {
    primary: 'bg-primary-50 text-primary-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {loading ? (
            <div className="h-8 w-24 bg-gray-100 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          )}
          {change !== undefined && !loading && (
            <div className={`flex items-center mt-2 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? <FiTrendingUp className="w-4 h-4 mr-1" /> : <FiTrendingDown className="w-4 h-4 mr-1" />}
              <span>{Math.abs(change)}% vs période précédente</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  )
}

function BarChart({ data, title }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-24 text-sm text-gray-600 truncate">{item.label}</div>
            <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
              <div className="h-full bg-primary-500 rounded-lg transition-all duration-500"
                   style={{ width: `${(item.value / maxValue) * 100}%` }} />
            </div>
            <div className="w-24 text-right text-sm font-medium text-gray-900">{item.formatted || item.value}</div>
          </div>
        ))}
        {data.length === 0 && <p className="text-center text-gray-500 py-4">Aucune donnée</p>}
      </div>
    </div>
  )
}

function AgentLeaderboard({ agents }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Top Agents</h3>
      <div className="space-y-3">
        {agents.map((agent, i) => (
          <div key={agent.agent_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              i === 0 ? 'bg-yellow-100 text-yellow-700'
                : i === 1 ? 'bg-gray-200 text-gray-700'
                : i === 2 ? 'bg-orange-100 text-orange-700'
                : 'bg-gray-100 text-gray-600'
            }`}>{i + 1}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{agent.agent_name || '—'}</p>
              <p className="text-xs text-gray-500">
                {agent.transactions_won} transaction{agent.transactions_won > 1 ? 's' : ''} · {agent.properties_created} bien{agent.properties_created > 1 ? 's' : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-900">{formatPrice(agent.commission_earned)}</p>
              <p className="text-xs text-gray-500">commission</p>
            </div>
          </div>
        ))}
        {agents.length === 0 && <p className="text-center text-gray-500 py-4">Aucune donnée</p>}
      </div>
    </div>
  )
}

// Onglet « Vue d'ensemble » des Analyses : digest opérationnel de l'agence.
// Compteurs & top agents viennent de stats/* (portée période) ; CA, tunnel et
// KPIs de analytics/financial + pipeline (portée période + type + agent).
function OverviewAnalytics() {
  const filters = useFilters()
  const days = rangeToDays(filters.range)

  const { data: overview, isLoading: loadingOverview } = useQuery(
    ['bo-stats-overview', days], () => backofficeService.getStats({ period: days }))
  const { data: agentData } = useQuery(
    ['bo-agent-perf', days], () => backofficeService.getAgentPerformance({ period: days }))
  const { data: citiesData } = useQuery(
    ['bo-props-by-city'], () => backofficeService.getPropertiesByCity())
  const { data: financial, isLoading: loadingFin } = useQuery(
    ['bo-ov-financial', filters], () => analyticsService.getFinancial(filters))
  const { data: pipeline } = useQuery(
    ['bo-ov-pipeline', filters], () => analyticsService.getPipeline(filters))

  const fs = financial?.summary || {}
  const fd = financial?.detail || {}
  const funnel = pipeline?.summary?.funnel || {}

  const agents = useMemo(
    () => [...(agentData?.agents || [])].sort((a, b) => (b.commission_earned || 0) - (a.commission_earned || 0)),
    [agentData])

  const handleExport = async () => {
    try {
      const blob = await backofficeService.exportCsv('properties')
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stats-biens-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a); a.click()
      window.URL.revokeObjectURL(url); document.body.removeChild(a)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-gray-500">Vue d'ensemble des performances de l'agence</p>
        <button onClick={handleExport}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
          <FiDownload className="w-5 h-5" /> Exporter (biens)
        </button>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Chiffre d'affaires" value={formatPrice(fs.revenue_realized || 0)}
                  icon={FiDollarSign} color="green" loading={loadingFin} />
        <StatCard title="Transactions gagnées" value={fs.deals_won || 0}
                  icon={FiBarChart2} color="purple" loading={loadingFin} />
        <StatCard title="Nouveaux clients" value={overview?.clients?.count || 0}
                  change={overview?.clients?.change} icon={FiUsers} color="blue" loading={loadingOverview} />
        <StatCard title="Visites effectuées" value={overview?.visits?.count || 0}
                  change={overview?.visits?.change} icon={FiCalendar} color="yellow" loading={loadingOverview} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChart title="Chiffre d'affaires par mois"
                  data={(fd.revenue_trend || []).map((m) => ({
                    label: m.month, value: m.realized, formatted: formatPrice(m.realized),
                  }))} />
        <BarChart title="Commission par type de transaction"
                  data={(fd.deals_by_type || []).map((t) => ({
                    label: TX_TYPE_LABELS[t.type] || t.type, value: t.commission, formatted: formatPrice(t.commission),
                  }))} />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AgentLeaderboard agents={agents} />

        {/* Biens par ville */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Biens par ville</h3>
          <div className="space-y-3">
            {(citiesData?.cities || []).map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">{item.city}</span>
                <span className="font-semibold text-gray-900">{item.count}</span>
              </div>
            ))}
            {(!citiesData?.cities || citiesData.cities.length === 0) && (
              <p className="text-center text-gray-500 py-4">Aucune donnée</p>
            )}
          </div>
        </div>

        {/* Tunnel de conversion */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Tunnel de conversion</h3>
          <div className="space-y-2">
            {[
              { label: 'Leads', value: funnel.leads || 0, color: 'bg-blue-500' },
              { label: 'Qualifiés', value: funnel.qualified || 0, color: 'bg-yellow-500' },
              { label: 'Visites', value: funnel.visits || 0, color: 'bg-orange-500' },
              { label: 'Offres', value: funnel.offers || 0, color: 'bg-purple-500' },
              { label: 'Clôturés', value: funnel.closed || 0, color: 'bg-green-500' },
            ].map((step, i) => {
              const maxValue = funnel.leads || 1
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">{step.label}</span>
                    <span className="font-medium text-gray-900">{step.value}</span>
                  </div>
                  <div className="h-6 bg-gray-100 rounded overflow-hidden">
                    <div className={`h-full ${step.color} rounded transition-all duration-500`}
                         style={{ width: `${(step.value / maxValue) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Indicateurs clés</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-primary-600">{(pipeline?.summary?.conversion_overall_pct || 0).toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">Taux de conversion</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-primary-600">{fs.avg_sales_cycle_days || 0}</p>
            <p className="text-sm text-gray-500 mt-1">Jours moyen de clôture</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-primary-600">{formatPrice(fs.avg_deal_size || 0)}</p>
            <p className="text-sm text-gray-500 mt-1">Valeur moyenne transaction</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-primary-600">{formatPrice(fs.revenue_pipeline_weighted || 0)}</p>
            <p className="text-sm text-gray-500 mt-1">Pipeline pondéré</p>
          </div>
        </div>
      </div>
    </div>
  )
}
export default OverviewAnalytics
