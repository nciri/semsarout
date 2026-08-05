import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiPlus, FiSearch, FiFilter, FiGrid, FiList, FiDollarSign,
  FiCalendar, FiUser, FiHome, FiMoreVertical, FiEye
} from 'react-icons/fi'
import { formatPrice } from '../../utils/currency'
import api from '../../services/api'

const backofficeService = {
  getTransactions: async (params) => {
    const searchParams = new URLSearchParams(params)
    const { data } = await api.get(`/backoffice/transactions?${searchParams}`)
    return data
  }
}

const STATUS_COLORS = {
  active: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  on_hold: 'bg-yellow-100 text-yellow-700'
}

const STAGE_KEYS = [
  'contact', 'visit', 'offer', 'negotiation', 'compromise',
  'final_act', 'application', 'verification', 'lease', 'move_in',
]

const TYPE_KEYS = ['sale', 'rent']

export default function BackofficeTransactions() {
  const { t } = useTranslation(['backoffice', 'common'])
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    stage: '',
    page: 1
  })
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useQuery(
    ['backoffice-transactions', filters, search],
    () => backofficeService.getTransactions({ ...filters, q: search }),
    { keepPreviousData: true }
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('backoffice:crm.transactions.list.pageTitle')}</h1>
          <p className="text-gray-500">{t('backoffice:crm.transactions.list.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/backoffice/pipeline"
            className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <FiGrid className="w-5 h-5" />
            {t('backoffice:crm.transactions.list.pipelineViewLink')}
          </Link>
          <Link
            to="/backoffice/transactions/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FiPlus className="w-5 h-5" />
            {t('backoffice:crm.transactions.list.newButton')}
          </Link>
        </div>
      </div>

      {/* Search and filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <FiSearch className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('backoffice:crm.transactions.list.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-10 pe-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              showFilters ? 'border-primary-500 text-primary-600 bg-primary-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FiFilter className="w-5 h-5" />
            {t('backoffice:crm.transactions.list.filtersButton')}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.transactions.list.filterTypeLabel')}</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('backoffice:crm.transactions.list.filterTypeAll')}</option>
                {TYPE_KEYS.map((key) => (
                  <option key={key} value={key}>{t(`backoffice:crm.transactions.type.${key}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.transactions.list.filterStatusLabel')}</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('backoffice:crm.transactions.list.filterStatusAll')}</option>
                {Object.keys(STATUS_COLORS).map((key) => (
                  <option key={key} value={key}>{t(`backoffice:crm.transactions.status.${key}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.transactions.list.filterStageLabel')}</label>
              <select
                value={filters.stage}
                onChange={(e) => setFilters({ ...filters, stage: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('backoffice:crm.transactions.list.filterStageAll')}</option>
                {STAGE_KEYS.map((key) => (
                  <option key={key} value={key}>{t(`backoffice:crm.transactions.stage.${key}`)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ type: '', status: '', stage: '', page: 1 })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                {t('backoffice:crm.transactions.list.resetFilters')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transactions table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : data?.transactions?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('backoffice:crm.transactions.list.columns.reference')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('backoffice:crm.transactions.list.columns.property')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('backoffice:crm.transactions.list.columns.client')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('backoffice:crm.transactions.list.columns.type')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('backoffice:crm.transactions.list.columns.stage')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('backoffice:crm.transactions.list.columns.price')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('backoffice:crm.transactions.list.columns.status')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t('backoffice:crm.transactions.list.columns.agent')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-gray-600">{tx.reference}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FiHome className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 line-clamp-1">{tx.property_title || '-'}</p>
                          <p className="text-xs text-gray-500">{tx.property_city}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FiUser className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700">{tx.client_name || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{t(`backoffice:crm.transactions.type.${tx.transaction_type}`, { defaultValue: tx.transaction_type })}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{t(`backoffice:crm.transactions.stage.${tx.stage}`, { defaultValue: tx.stage })}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">{formatPrice(tx.asking_price || 0)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[tx.status]}`}>
                        {t(`backoffice:crm.transactions.status.${tx.status}`, { defaultValue: tx.status })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{tx.agent_name || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/backoffice/transactions/${tx.id}`}
                        className="inline-flex p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50"
                        title={t('backoffice:crm.transactions.list.viewDetails')}
                      >
                        <FiEye className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <FiDollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('backoffice:crm.transactions.list.empty.title')}</h3>
            <p className="text-gray-500 mb-4">
              {search || filters.type || filters.status || filters.stage
                ? t('backoffice:crm.transactions.list.empty.filtered')
                : t('backoffice:crm.transactions.list.empty.default')}
            </p>
            <Link
              to="/backoffice/pipeline"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <FiGrid className="w-5 h-5" />
              {t('backoffice:crm.transactions.list.empty.pipelineLink')}
            </Link>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data?.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            disabled={filters.page === 1}
            className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            {t('backoffice:crm.transactions.list.prev')}
          </button>
          <span className="text-gray-600">
            {t('backoffice:crm.transactions.list.pageInfo', { page: filters.page, total: data.pages })}
          </span>
          <button
            onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            disabled={filters.page === data.pages}
            className="px-4 py-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            {t('backoffice:crm.transactions.list.next')}
          </button>
        </div>
      )}
    </div>
  )
}
