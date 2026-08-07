import { useQuery } from 'react-query'
import {
  FiHome, FiUsers, FiMail, FiCalendar, FiTrendingUp,
  FiTrendingDown, FiDollarSign, FiEye, FiArrowRight
} from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DirIcon from '../../components/common/DirIcon'
import { formatPrice } from '../../utils/currency'
import api from '../../services/api'
import { useFormat } from '../../utils/format'

// Mock service - replace with actual API service
const backofficeService = {
  getDashboard: async () => {
    const { data } = await api.get('/backoffice/dashboard')
    return data
  }
}

function StatCard({ title, value, change, icon: Icon, color = 'primary', suffix = '' }) {
  const { t } = useTranslation('backoffice')
  const isPositive = change >= 0

  const colorClasses = {
    primary: 'bg-primary-50 text-primary-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600'
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {value}{suffix}
          </p>
          {change !== undefined && (
            <div className={`flex items-center mt-2 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? <FiTrendingUp className="w-4 h-4 me-1" /> : <FiTrendingDown className="w-4 h-4 me-1" />}
              <span>{t('dashboard.vsLastMonth', { value: Math.abs(change) })}</span>
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

function RecentLeadCard({ lead }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate } = useFormat()
  const sourceColors = {
    contact_form: 'bg-blue-100 text-blue-700',
    phone_reveal: 'bg-green-100 text-green-700',
    callback_request: 'bg-purple-100 text-purple-700'
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-sm font-medium text-gray-600">
            {lead.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </span>
        </div>
        <div>
          <p className="font-medium text-gray-900">{lead.name}</p>
          <p className="text-sm text-gray-500">{lead.email}</p>
        </div>
      </div>
      <div className="text-end">
        <span className={`text-xs px-2 py-1 rounded-full ${sourceColors[lead.source] || 'bg-gray-100 text-gray-700'}`}>
          {t(`crm.pipeline.leads.source.${lead.source}`, { defaultValue: lead.source })}
        </span>
        <p className="text-xs text-gray-400 mt-1">
          {fmtDate(lead.created_at)}
        </p>
      </div>
    </div>
  )
}

function UpcomingVisitCard({ visit }) {
  const { t } = useTranslation('backoffice')
  const { fmtDate, fmtTime } = useFormat()
  const statusColors = {
    scheduled: 'bg-gray-100 text-gray-700',
    confirmed: 'bg-blue-100 text-blue-700'
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="text-center bg-primary-50 rounded-lg p-2 min-w-[50px]">
          <p className="text-xs text-primary-600 font-medium">
            {fmtDate(visit.scheduled_at, { weekday: 'short' })}
          </p>
          <p className="text-lg font-bold text-primary-700">
            {new Date(visit.scheduled_at).getDate()}
          </p>
        </div>
        <div>
          <p className="font-medium text-gray-900 line-clamp-1">{visit.property_title || t('dashboard.visitFallback')}</p>
          <p className="text-sm text-gray-500">
            {fmtTime(visit.scheduled_at)}
            {' - '}{visit.contact_name}
          </p>
        </div>
      </div>
      <span className={`text-xs px-2 py-1 rounded-full ${statusColors[visit.status] || 'bg-gray-100'}`}>
        {t(`crm.pipeline.visits.status.${visit.status}`, { defaultValue: visit.status })}
      </span>
    </div>
  )
}

export default function BackofficeDashboard() {
  const { t } = useTranslation('backoffice')
  const { data, isLoading } = useQuery('backoffice-dashboard', backofficeService.getDashboard, {
    refetchInterval: 60000 // Refresh every minute
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
          <p className="text-gray-500">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
            <option value="30">{t('dashboard.period.last30')}</option>
            <option value="7">{t('dashboard.period.last7')}</option>
            <option value="90">{t('dashboard.period.last90')}</option>
          </select>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('dashboard.stats.activeProperties')}
          value={data?.properties?.active || 0}
          change={12}
          icon={FiHome}
          color="primary"
        />
        <StatCard
          title={t('dashboard.stats.newLeads')}
          value={data?.leads?.this_week || 0}
          change={data?.leads?.conversion_rate}
          icon={FiMail}
          color="blue"
        />
        <StatCard
          title={t('dashboard.stats.plannedVisits')}
          value={data?.visits?.this_week || 0}
          icon={FiCalendar}
          color="green"
        />
        <StatCard
          title={t('dashboard.stats.activePipeline')}
          value={formatPrice(data?.transactions?.pipeline_value || 0)}
          icon={FiDollarSign}
          color="purple"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent leads */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t('dashboard.latestLeads')}</h2>
            <Link to="/backoffice/leads" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              {t('dashboard.viewAll')} <DirIcon icon={FiArrowRight} className="w-4 h-4" />
            </Link>
          </div>
          <div className="p-4">
            {data?.recent_leads?.length > 0 ? (
              data.recent_leads.map(lead => (
                <RecentLeadCard key={lead.id} lead={lead} />
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">{t('dashboard.noRecentLead')}</p>
            )}
          </div>
        </div>

        {/* Upcoming visits */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t('dashboard.upcomingVisits')}</h2>
            <Link to="/backoffice/visites" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              {t('dashboard.viewAll')} <DirIcon icon={FiArrowRight} className="w-4 h-4" />
            </Link>
          </div>
          <div className="p-4">
            {data?.upcoming_visits?.length > 0 ? (
              data.upcoming_visits.map(visit => (
                <UpcomingVisitCard key={visit.id} visit={visit} />
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">{t('dashboard.noPlannedVisit')}</p>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-900 mb-4">{t('dashboard.monthSummary')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <FiDollarSign className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-gray-600">{t('dashboard.revenue')}</span>
              </div>
              <span className="font-bold text-gray-900">{formatPrice(data?.revenue?.this_month || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FiHome className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-gray-600">{t('dashboard.soldProperties')}</span>
              </div>
              <span className="font-bold text-gray-900">{data?.properties?.sold_this_month || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FiUsers className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-gray-600">{t('dashboard.newClients')}</span>
              </div>
              <span className="font-bold text-gray-900">{data?.clients?.new_this_month || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <FiEye className="w-5 h-5 text-yellow-600" />
                </div>
                <span className="text-gray-600">{t('dashboard.activeTransactions')}</span>
              </div>
              <span className="font-bold text-gray-900">{data?.transactions?.active || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">{t('dashboard.quickActions')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            to="/backoffice/biens/nouveau"
            className="flex flex-col items-center p-4 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors"
          >
            <FiHome className="w-8 h-8 text-primary-600 mb-2" />
            <span className="text-sm font-medium text-primary-700">{t('dashboard.addProperty')}</span>
          </Link>
          <Link
            to="/backoffice/clients/nouveau"
            className="flex flex-col items-center p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
          >
            <FiUsers className="w-8 h-8 text-blue-600 mb-2" />
            <span className="text-sm font-medium text-blue-700">{t('dashboard.newClient')}</span>
          </Link>
          <Link
            to="/backoffice/visites/nouvelle"
            className="flex flex-col items-center p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors"
          >
            <FiCalendar className="w-8 h-8 text-green-600 mb-2" />
            <span className="text-sm font-medium text-green-700">{t('dashboard.planVisit')}</span>
          </Link>
          <Link
            to="/backoffice/pipeline"
            className="flex flex-col items-center p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors"
          >
            <FiTrendingUp className="w-8 h-8 text-purple-600 mb-2" />
            <span className="text-sm font-medium text-purple-700">{t('dashboard.viewPipeline')}</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
