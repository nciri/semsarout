import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiMail, FiPhone, FiMessageSquare, FiChevronDown } from 'react-icons/fi'
import { format } from 'date-fns'
import { fr, ar } from 'date-fns/locale'
import api from '../../services/api'

const STATUS_TONE = {
  new: 'badge-primary',
  contacted: 'badge-warning',
  qualified: 'bg-blue-100 text-blue-800',
  converted: 'badge-success',
  lost: 'bg-gray-100 text-gray-600',
}
const STATUS_VALUES = ['new', 'contacted', 'qualified', 'converted', 'lost']

function MyLeads() {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const dateFnsLocale = i18n.language === 'ar' ? ar : fr
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const status = searchParams.get('status') || ''
  const page = parseInt(searchParams.get('page') || '1')

  const { data, isLoading } = useQuery(
    ['my-leads', { status, page }],
    async () => {
      const response = await api.get('/my-leads', {
        params: { status, page, per_page: 10 }
      })
      return response.data
    }
  )

  const updateStatusMutation = useMutation(
    ({ leadId, newStatus }) => api.put(`/leads/${leadId}/status`, { status: newStatus }),
    {
      onSuccess: () => {
        toast.success(t('dashboard:myLeads.toasts.statusUpdated'))
        queryClient.invalidateQueries('my-leads')
      },
      onError: () => {
        toast.error(t('dashboard:myLeads.toasts.updateError'))
      }
    }
  )

  const statusLabel = (value) => t(`dashboard:myLeads.status.${value}`, { defaultValue: value })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-900">{t('dashboard:myLeads.title')}</h1>
        <p className="text-gray-600">{t('dashboard:myLeads.subtitle', { count: data?.total || 0 })}</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {['', ...STATUS_VALUES].map(value => (
          <button
            key={value}
            onClick={() => {
              const newParams = new URLSearchParams(searchParams)
              if (value) {
                newParams.set('status', value)
              } else {
                newParams.delete('status')
              }
              newParams.set('page', '1')
              setSearchParams(newParams)
            }}
            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
              status === value
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {value ? statusLabel(value) : t('dashboard:myLeads.filters.all')}
          </button>
        ))}
      </div>

      {/* Leads List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : data?.leads?.length > 0 ? (
        <div className="space-y-4">
          {data.leads.map(lead => (
            <div key={lead.id} className="card p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{lead.name}</h3>
                    <div className="relative group">
                      <button className={`badge ${
                        STATUS_TONE[lead.status] || 'bg-gray-100'
                      } cursor-pointer`}>
                        {statusLabel(lead.status)}
                        <FiChevronDown className="ms-1 w-3 h-3" />
                      </button>
                      <div className="absolute start-0 mt-1 bg-white rounded-lg shadow-lg border py-1 hidden group-hover:block z-10">
                        {STATUS_VALUES.map(value => (
                          <button
                            key={value}
                            onClick={() => updateStatusMutation.mutate({
                              leadId: lead.id,
                              newStatus: value
                            })}
                            className="block w-full text-start px-4 py-2 text-sm hover:bg-gray-50"
                          >
                            {statusLabel(value)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <a href={`mailto:${lead.email}`} className="flex items-center hover:text-primary-600">
                      <FiMail className="w-4 h-4 me-1" />
                      {lead.email}
                    </a>
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="flex items-center hover:text-primary-600">
                        <FiPhone className="w-4 h-4 me-1" />
                        {lead.phone}
                      </a>
                    )}
                  </div>

                  {lead.message && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start">
                        <FiMessageSquare className="w-4 h-4 me-2 mt-0.5 text-gray-400" />
                        <p className="text-sm text-gray-600">{lead.message}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-sm text-gray-500 md:text-end shrink-0">
                  <p>
                    {format(new Date(lead.created_at), 'dd MMM yyyy à HH:mm', { locale: dateFnsLocale })}
                  </p>
                  {lead.property_id && (
                    <Link
                      to={`/annonces/${lead.property_id}`}
                      className="text-primary-600 hover:underline"
                    >
                      {t('dashboard:myLeads.viewListing')}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <FiMessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">{t('dashboard:myLeads.empty.title')}</p>
          <p className="text-sm text-gray-400 mt-1">
            {t('dashboard:myLeads.empty.message')}
          </p>
        </div>
      )}
    </div>
  )
}

export default MyLeads
