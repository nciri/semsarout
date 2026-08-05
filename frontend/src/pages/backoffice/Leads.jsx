import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useTranslation } from 'react-i18next'
import {
  FiMail, FiPhone, FiFilter, FiSearch, FiChevronUp,
  FiChevronDown, FiCheck, FiX, FiEye, FiUserPlus, FiCalendar, FiMessageSquare
} from 'react-icons/fi'
import api from '../../services/api'

const backofficeService = {
  getLeads: async (params) => {
    const searchParams = new URLSearchParams(params)
    const { data } = await api.get(`/backoffice/leads?${searchParams}`)
    return data
  },
  updateLead: async ({ id, data }) => {
    const { data: responseData } = await api.put(`/backoffice/leads/${id}`, data)
    return responseData
  },
  convertToClient: async (id) => {
    const { data } = await api.post(`/backoffice/clients/convert-lead/${id}`)
    return data
  }
}

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  qualified: 'bg-green-100 text-green-700',
  converted: 'bg-purple-100 text-purple-700',
  lost: 'bg-gray-100 text-gray-700'
}

const SOURCE_KEYS = ['contact_form', 'phone_reveal', 'callback_request', 'website', 'manual', 'other']

const NEXT_STATUS = {
  new: 'contacted',
  contacted: 'qualified',
  qualified: 'converted'
}

function SortHeader({ label, field, currentSort, onSort }) {
  const isActive = currentSort.field === field
  const isAsc = currentSort.order === 'asc'

  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 font-medium text-gray-700 hover:text-gray-900"
    >
      {label}
      <span className="flex flex-col">
        <FiChevronUp className={`w-3 h-3 -mb-1 ${isActive && isAsc ? 'text-primary-600' : 'text-gray-300'}`} />
        <FiChevronDown className={`w-3 h-3 ${isActive && !isAsc ? 'text-primary-600' : 'text-gray-300'}`} />
      </span>
    </button>
  )
}

function LeadDetailModal({ lead, onClose, t }) {
  if (!lead) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t('backoffice:crm.pipeline.leads.detail.title')}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Contact info */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xl font-semibold text-primary-600">
                {lead.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900">{lead.name}</h3>
              <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium mt-1 ${STATUS_COLORS[lead.status]}`}>
                {t(`backoffice:crm.pipeline.leads.status.${lead.status}`, { defaultValue: lead.status })}
              </span>
            </div>
          </div>

          {/* Coordonnées */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t('backoffice:crm.pipeline.leads.detail.contactInfo')}</h4>
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="flex items-center gap-3 text-gray-700 hover:text-primary-600">
                <FiMail className="w-5 h-5 text-gray-400" />
                {lead.email}
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="flex items-center gap-3 text-gray-700 hover:text-primary-600">
                <FiPhone className="w-5 h-5 text-gray-400" />
                {lead.phone}
              </a>
            )}
          </div>

          {/* Message */}
          {lead.message && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t('backoffice:crm.pipeline.leads.detail.message')}</h4>
              <div className="flex items-start gap-3">
                <FiMessageSquare className="w-5 h-5 text-gray-400 mt-0.5" />
                <p className="text-gray-700 whitespace-pre-wrap">{lead.message}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{t('backoffice:crm.pipeline.leads.detail.internalNotes')}</h4>
              <p className="text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

          {/* Infos supplémentaires */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-gray-500">{t('backoffice:crm.pipeline.leads.detail.source')}</h4>
              <p className="text-gray-900">{t(`backoffice:crm.pipeline.leads.source.${lead.source}`, { defaultValue: lead.source })}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-gray-500">{t('backoffice:crm.pipeline.leads.detail.createdAt')}</h4>
              <p className="text-gray-900 flex items-center gap-2">
                <FiCalendar className="w-4 h-4 text-gray-400" />
                {new Date(lead.created_at).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
            {lead.property_title && (
              <div className="col-span-2 space-y-1">
                <h4 className="text-sm font-medium text-gray-500">{t('backoffice:crm.pipeline.leads.detail.property')}</h4>
                <p className="text-gray-900">{lead.property_title}</p>
              </div>
            )}
            {lead.assigned_to_name && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-gray-500">{t('backoffice:crm.pipeline.leads.detail.assignedTo')}</h4>
                <p className="text-gray-900">{lead.assigned_to_name}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BackofficeLeads() {
  const { t } = useTranslation(['backoffice', 'common'])
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    status: '',
    source: '',
    page: 1
  })
  const [sort, setSort] = useState({ field: 'created_at', order: 'desc' })
  const [showFilters, setShowFilters] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)

  const { data, isLoading } = useQuery(
    ['backoffice-leads', filters, search, sort],
    () => backofficeService.getLeads({
      ...filters,
      q: search,
      sort_by: sort.field,
      sort_order: sort.order
    }),
    { keepPreviousData: true }
  )

  const updateMutation = useMutation(backofficeService.updateLead, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-leads')
    }
  })

  const convertMutation = useMutation(backofficeService.convertToClient, {
    onSuccess: () => {
      queryClient.invalidateQueries('backoffice-leads')
      queryClient.invalidateQueries('backoffice-clients')
    }
  })

  const handleAdvanceStatus = (lead) => {
    const nextStatus = NEXT_STATUS[lead.status]
    if (!nextStatus) return

    const message = lead.status === 'qualified'
      ? t('backoffice:crm.pipeline.leads.confirm.convert', { name: lead.name })
      : t('backoffice:crm.pipeline.leads.confirm.markStatus', {
          name: lead.name,
          status: t(`backoffice:crm.pipeline.leads.status.${nextStatus}`).toLowerCase()
        })

    if (window.confirm(message)) {
      if (lead.status === 'qualified') {
        convertMutation.mutate(lead.id)
      } else {
        updateMutation.mutate({ id: lead.id, data: { status: nextStatus } })
      }
    }
  }

  const handleMarkLost = (lead) => {
    if (window.confirm(t('backoffice:crm.pipeline.leads.confirm.lost', { name: lead.name }))) {
      updateMutation.mutate({ id: lead.id, data: { status: 'lost' } })
    }
  }

  const handleSort = (field) => {
    setSort(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }))
  }

  const stats = {
    total: data?.total || 0,
    new: data?.stats?.new || 0,
    qualified: data?.stats?.qualified || 0,
    converted: data?.stats?.converted || 0
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('backoffice:crm.pipeline.leads.list.pageTitle')}</h1>
          <p className="text-gray-500">{t('backoffice:crm.pipeline.leads.list.subtitle')}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">{t('backoffice:crm.pipeline.leads.list.stats.total')}</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">{t('backoffice:crm.pipeline.leads.list.stats.new')}</p>
          <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">{t('backoffice:crm.pipeline.leads.list.stats.qualified')}</p>
          <p className="text-2xl font-bold text-green-600">{stats.qualified}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">{t('backoffice:crm.pipeline.leads.list.stats.converted')}</p>
          <p className="text-2xl font-bold text-purple-600">{stats.converted}</p>
        </div>
      </div>

      {/* Search and filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <FiSearch className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('backoffice:crm.pipeline.leads.list.searchPlaceholder')}
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
            {t('backoffice:crm.pipeline.leads.list.filtersButton')}
            {(filters.status || filters.source) && (
              <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.pipeline.leads.list.filterStatusLabel')}</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('backoffice:crm.pipeline.leads.list.filterStatusAll')}</option>
                {Object.keys(STATUS_COLORS).map((statusKey) => (
                  <option key={statusKey} value={statusKey}>{t(`backoffice:crm.pipeline.leads.status.${statusKey}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:crm.pipeline.leads.list.filterSourceLabel')}</label>
              <select
                value={filters.source}
                onChange={(e) => setFilters({ ...filters, source: e.target.value, page: 1 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('backoffice:crm.pipeline.leads.list.filterSourceAll')}</option>
                {SOURCE_KEYS.map((sourceKey) => (
                  <option key={sourceKey} value={sourceKey}>{t(`backoffice:crm.pipeline.leads.source.${sourceKey}`)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ status: '', source: '', page: 1 })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                {t('backoffice:crm.pipeline.leads.list.resetFilters')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Leads table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8">
            <div className="animate-pulse space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div className="flex-1 h-4 bg-gray-200 rounded"></div>
                  <div className="w-24 h-4 bg-gray-200 rounded"></div>
                  <div className="w-20 h-4 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        ) : data?.leads?.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <SortHeader label={t('backoffice:crm.pipeline.leads.list.columns.contact')} field="name" currentSort={sort} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('backoffice:crm.pipeline.leads.list.columns.contactInfo')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <SortHeader label={t('backoffice:crm.pipeline.leads.list.columns.source')} field="source" currentSort={sort} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <SortHeader label={t('backoffice:crm.pipeline.leads.list.columns.status')} field="status" currentSort={sort} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('backoffice:crm.pipeline.leads.list.columns.property')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <SortHeader label={t('backoffice:crm.pipeline.leads.list.columns.date')} field="created_at" currentSort={sort} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('backoffice:crm.pipeline.leads.list.columns.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-primary-600">
                              {lead.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{lead.name}</p>
                            {lead.message && (
                              <p className="text-xs text-gray-500 truncate max-w-[200px]">{lead.message}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600">
                              <FiMail className="w-3.5 h-3.5" />
                              <span className="truncate max-w-[180px]">{lead.email}</span>
                            </a>
                          )}
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600">
                              <FiPhone className="w-3.5 h-3.5" />
                              {lead.phone}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {t(`backoffice:crm.pipeline.leads.source.${lead.source}`, { defaultValue: lead.source })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status]}`}>
                          {t(`backoffice:crm.pipeline.leads.status.${lead.status}`, { defaultValue: lead.status })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.property_title ? (
                          <span className="text-sm text-gray-600 truncate block max-w-[150px]" title={lead.property_title}>
                            {lead.property_title}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {new Date(lead.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-start gap-1">
                          {/* View details */}
                          <button
                            onClick={() => setSelectedLead(lead)}
                            className="p-2 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
                            title={t('backoffice:crm.pipeline.leads.list.viewDetails')}
                          >
                            <FiEye className="w-4 h-4" />
                          </button>

                          {/* Advance status / Convert */}
                          {lead.status !== 'converted' && lead.status !== 'lost' && (
                            <>
                              <button
                                onClick={() => handleAdvanceStatus(lead)}
                                className={`p-2 rounded-lg transition-colors ${
                                  lead.status === 'qualified'
                                    ? 'text-purple-500 hover:text-purple-700 hover:bg-purple-50'
                                    : 'text-green-500 hover:text-green-700 hover:bg-green-50'
                                }`}
                                title={t(`backoffice:crm.pipeline.leads.nextAction.${lead.status}`)}
                              >
                                {lead.status === 'qualified' ? (
                                  <FiUserPlus className="w-4 h-4" />
                                ) : (
                                  <FiCheck className="w-4 h-4" />
                                )}
                              </button>

                              {/* Mark as lost */}
                              <button
                                onClick={() => handleMarkLost(lead)}
                                className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                title={t('backoffice:crm.pipeline.leads.list.markLost')}
                              >
                                <FiX className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  {t('backoffice:crm.pipeline.leads.list.paginationInfo', {
                    from: ((filters.page - 1) * 20) + 1,
                    to: Math.min(filters.page * 20, data.total),
                    total: data.total
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                    disabled={filters.page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    {t('backoffice:crm.pipeline.leads.list.prev')}
                  </button>
                  <span className="text-sm text-gray-600">
                    {filters.page} / {data.pages}
                  </span>
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                    disabled={filters.page === data.pages}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    {t('backoffice:crm.pipeline.leads.list.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center">
            <FiMail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('backoffice:crm.pipeline.leads.list.empty.title')}</h3>
            <p className="text-gray-500">
              {search || filters.status || filters.source
                ? t('backoffice:crm.pipeline.leads.list.empty.filtered')
                : t('backoffice:crm.pipeline.leads.list.empty.default')}
            </p>
          </div>
        )}
      </div>

      {/* Lead detail modal */}
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          t={t}
        />
      )}
    </div>
  )
}
