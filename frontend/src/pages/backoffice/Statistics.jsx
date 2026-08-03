import { useState } from 'react'
import { useQuery } from 'react-query'
import {
  FiTrendingUp, FiTrendingDown, FiDollarSign, FiHome, FiUsers,
  FiCalendar, FiBarChart2, FiPieChart, FiDownload
} from 'react-icons/fi'
import { formatPrice } from '../../utils/currency'
import api from '../../services/api'

const backofficeService = {
  getStats: async (params) => {
    const searchParams = new URLSearchParams(params)
    const { data } = await api.get(`/backoffice/stats/overview?${searchParams}`)
    return data
  },
  getAgentPerformance: async (params) => {
    const searchParams = new URLSearchParams(params)
    const { data } = await api.get(`/backoffice/stats/agent-performance?${searchParams}`)
    return data
  },
  exportStats: async (params) => {
    const searchParams = new URLSearchParams(params)
    const { data } = await api.get(`/backoffice/stats/export?${searchParams}`, { responseType: 'blob' })
    return data
  }
}

function StatCard({ title, value, change, icon: Icon, color = 'primary', prefix = '', suffix = '' }) {
  const isPositive = change >= 0
  const colorClasses = {
    primary: 'bg-primary-50 text-primary-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600'
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {prefix}{value}{suffix}
          </p>
          {change !== undefined && (
            <div className={`flex items-center mt-2 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? <FiTrendingUp className="w-4 h-4 mr-1" /> : <FiTrendingDown className="w-4 h-4 mr-1" />}
              <span>{Math.abs(change)}% vs mois dernier</span>
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
  const maxValue = Math.max(...data.map(d => d.value), 1)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-24 text-sm text-gray-600 truncate">{item.label}</div>
            <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-lg transition-all duration-500"
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
            <div className="w-20 text-right text-sm font-medium text-gray-900">
              {item.formatted || item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentLeaderboard({ agents }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Top Agents</h3>
      <div className="space-y-3">
        {agents?.map((agent, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              i === 0 ? 'bg-yellow-100 text-yellow-700' :
              i === 1 ? 'bg-gray-200 text-gray-700' :
              i === 2 ? 'bg-orange-100 text-orange-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {i + 1}
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{agent.name}</p>
              <p className="text-xs text-gray-500">{agent.transactions} transactions</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-900">{formatPrice(agent.revenue)}</p>
              <p className="text-xs text-gray-500">{formatPrice(agent.commission)} commission</p>
            </div>
          </div>
        ))}
        {(!agents || agents.length === 0) && (
          <p className="text-center text-gray-500 py-4">Aucune donnée</p>
        )}
      </div>
    </div>
  )
}

export default function BackofficeStatistics() {
  const [period, setPeriod] = useState('30')

  const { data: statsData, isLoading: loadingStats } = useQuery(
    ['backoffice-stats', period],
    () => backofficeService.getStats({ days: period })
  )

  const { data: agentData, isLoading: loadingAgents } = useQuery(
    ['backoffice-agent-performance', period],
    () => backofficeService.getAgentPerformance({ days: period })
  )

  const handleExport = async (format) => {
    try {
      const blob = await backofficeService.exportStats({ days: period, format })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stats-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques</h1>
          <p className="text-gray-500">Analysez les performances de votre agence</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">3 derniers mois</option>
            <option value="365">12 derniers mois</option>
          </select>
          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FiDownload className="w-5 h-5" />
            Exporter
          </button>
        </div>
      </div>

      {/* Main stats */}
      {loadingStats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Chiffre d'affaires"
            value={formatPrice(statsData?.revenue?.total || 0)}
            change={statsData?.revenue?.change}
            icon={FiDollarSign}
            color="green"
          />
          <StatCard
            title="Transactions clôturées"
            value={statsData?.transactions?.closed || 0}
            change={statsData?.transactions?.change}
            icon={FiBarChart2}
            color="purple"
          />
          <StatCard
            title="Nouveaux clients"
            value={statsData?.clients?.new || 0}
            change={statsData?.clients?.change}
            icon={FiUsers}
            color="blue"
          />
          <StatCard
            title="Visites effectuées"
            value={statsData?.visits?.completed || 0}
            change={statsData?.visits?.change}
            icon={FiCalendar}
            color="yellow"
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by month */}
        <BarChart
          title="Chiffre d'affaires par mois"
          data={statsData?.revenue_by_month?.map(m => ({
            label: m.month,
            value: m.value,
            formatted: formatPrice(m.value)
          })) || []}
        />

        {/* Transactions by stage */}
        <BarChart
          title="Transactions par étape"
          data={statsData?.transactions_by_stage?.map(s => ({
            label: s.stage,
            value: s.count,
            formatted: `${s.count}`
          })) || []}
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent leaderboard */}
        <AgentLeaderboard agents={agentData?.agents} />

        {/* Properties by type */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Biens par type</h3>
          <div className="space-y-3">
            {statsData?.properties_by_type?.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">{item.type}</span>
                <span className="font-semibold text-gray-900">{item.count}</span>
              </div>
            ))}
            {(!statsData?.properties_by_type || statsData.properties_by_type.length === 0) && (
              <p className="text-center text-gray-500 py-4">Aucune donnée</p>
            )}
          </div>
        </div>

        {/* Conversion funnel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Tunnel de conversion</h3>
          <div className="space-y-2">
            {[
              { label: 'Leads', value: statsData?.funnel?.leads || 0, color: 'bg-blue-500' },
              { label: 'Qualifiés', value: statsData?.funnel?.qualified || 0, color: 'bg-yellow-500' },
              { label: 'Visites', value: statsData?.funnel?.visits || 0, color: 'bg-orange-500' },
              { label: 'Offres', value: statsData?.funnel?.offers || 0, color: 'bg-purple-500' },
              { label: 'Clôturés', value: statsData?.funnel?.closed || 0, color: 'bg-green-500' }
            ].map((step, i) => {
              const maxValue = statsData?.funnel?.leads || 1
              const width = (step.value / maxValue) * 100
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">{step.label}</span>
                    <span className="font-medium text-gray-900">{step.value}</span>
                  </div>
                  <div className="h-6 bg-gray-100 rounded overflow-hidden">
                    <div
                      className={`h-full ${step.color} rounded transition-all duration-500`}
                      style={{ width: `${width}%` }}
                    />
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
            <p className="text-3xl font-bold text-primary-600">
              {statsData?.kpis?.conversion_rate?.toFixed(1) || 0}%
            </p>
            <p className="text-sm text-gray-500 mt-1">Taux de conversion</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-primary-600">
              {statsData?.kpis?.avg_days_to_close || 0}
            </p>
            <p className="text-sm text-gray-500 mt-1">Jours moyen de clôture</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-primary-600">
              {formatPrice(statsData?.kpis?.avg_transaction_value || 0)}
            </p>
            <p className="text-sm text-gray-500 mt-1">Valeur moyenne transaction</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-primary-600">
              {statsData?.kpis?.avg_commission_rate?.toFixed(1) || 0}%
            </p>
            <p className="text-sm text-gray-500 mt-1">Commission moyenne</p>
          </div>
        </div>
      </div>
    </div>
  )
}
