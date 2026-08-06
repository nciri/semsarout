import { useQuery } from 'react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FiArrowLeft, FiEdit2, FiMail, FiPhone, FiMapPin, FiUser,
  FiTag, FiFileText, FiDollarSign, FiPlus
} from 'react-icons/fi'
import { formatPrice } from '../../utils/currency'
import { transactionTypeForClient } from '../../utils/clients'
import DirIcon from '../../components/common/DirIcon'
import api from '../../services/api'

// Libellés type/statut/bien via t('backoffice:crm.shared.*'), keyés sur l'enum API.
const STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-gray-100 text-gray-700',
}

function Field({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <div className="text-sm text-gray-900 break-words">{children || '—'}</div>
      </div>
    </div>
  )
}

export default function BackofficeClientDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: client, isLoading } = useQuery(
    ['backoffice-client', id],
    async () => (await api.get(`/backoffice/clients/${id}`)).data,
  )

  const { data: agentsData } = useQuery('backoffice-agents', async () => {
    try {
      return (await api.get('/backoffice/users?role=agent')).data
    } catch {
      return { users: [] }
    }
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <p className="text-gray-500 mb-4">{t('backoffice:crm.shared.notFound')}</p>
        <Link to="/backoffice/clients" className="text-primary-600 hover:text-primary-700">
          {t('backoffice:crm.shared.back')}
        </Link>
      </div>
    )
  }

  const assignedAgent = agentsData?.users?.find(
    (a) => String(a.id) === String(client.assigned_agent_id),
  )
  const propertyTypes = client.search_criteria?.property_types || []
  const locations = client.search_criteria?.locations || []
  const txType = transactionTypeForClient(client.client_type)
  const createTxHref = `/backoffice/transactions/nouveau?client_id=${client.id}&type=${txType}`

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/backoffice/clients')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <DirIcon icon={FiArrowLeft} className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-base font-semibold text-primary-600">
                {client.first_name?.[0]}{client.last_name?.[0]}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {client.first_name} {client.last_name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-500">
                  {t(`backoffice:crm.shared.clientTypes.${client.client_type}`, { defaultValue: client.client_type })}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[client.status] || STATUS_BADGE.active}`}>
                  {t(`backoffice:crm.shared.status.${client.status}`, { defaultValue: t('backoffice:crm.shared.status.active') })}
                </span>
              </div>
            </div>
          </div>
        </div>
        <Link
          to={`/backoffice/clients/${client.id}/modifier`}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors self-start"
        >
          <FiEdit2 className="w-4 h-4" />
          {t('backoffice:crm.clients.detail.editButton')}
        </Link>
      </div>

      {/* Contact */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('backoffice:crm.clients.detail.sections.contact')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field icon={FiMail} label={t('backoffice:crm.clients.detail.fields.email')}>
            {client.email
              ? <a href={`mailto:${client.email}`} className="hover:text-primary-600">{client.email}</a>
              : null}
          </Field>
          <Field icon={FiPhone} label={t('backoffice:crm.clients.detail.fields.phonePrimary')}>
            {client.phone
              ? <a href={`tel:${client.phone}`} className="hover:text-primary-600">{client.phone}</a>
              : null}
          </Field>
          <Field icon={FiPhone} label={t('backoffice:crm.clients.detail.fields.phoneSecondary')}>
            {client.secondary_phone
              ? <a href={`tel:${client.secondary_phone}`} className="hover:text-primary-600">{client.secondary_phone}</a>
              : null}
          </Field>
          <Field icon={FiMapPin} label={t('backoffice:crm.clients.detail.fields.city')}>{client.city}</Field>
          <div className="md:col-span-2">
            <Field icon={FiMapPin} label={t('backoffice:crm.clients.detail.fields.address')}>{client.address}</Field>
          </div>
        </div>
      </div>

      {/* Search criteria */}
      {(client.budget_min || client.budget_max || propertyTypes.length > 0 || locations.length > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiDollarSign className="w-5 h-5 text-gray-400" />
            {t('backoffice:crm.clients.detail.sections.searchCriteria')}
          </h2>
          <div className="space-y-4">
            {(client.budget_min || client.budget_max) && (
              <p className="text-sm text-gray-700">
                {t('backoffice:crm.clients.detail.budget', { min: formatPrice(client.budget_min || 0), max: formatPrice(client.budget_max || 0) })}
              </p>
            )}
            {propertyTypes.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">{t('backoffice:crm.clients.detail.propertyTypesWanted')}</p>
                <div className="flex flex-wrap gap-2">
                  {propertyTypes.map((pt) => (
                    <span key={pt} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                      {t(`backoffice:crm.shared.propertyTypes.${pt}`, { defaultValue: pt })}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {locations.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">{t('backoffice:crm.clients.detail.preferredCities')}</p>
                <div className="flex flex-wrap gap-2">
                  {locations.map((l) => (
                    <span key={l} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">{l}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags & notes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field icon={FiUser} label={t('backoffice:crm.clients.detail.fields.agentAssigned')}>
            {assignedAgent ? `${assignedAgent.first_name} ${assignedAgent.last_name}` : null}
          </Field>
          <Field icon={FiTag} label={t('backoffice:crm.clients.detail.fields.tags')}>
            {client.tags?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {client.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs">{tag}</span>
                ))}
              </div>
            ) : null}
          </Field>
        </div>
        <Field icon={FiFileText} label={t('backoffice:crm.clients.detail.fields.notes')}>
          {client.notes ? <p className="whitespace-pre-wrap">{client.notes}</p> : null}
        </Field>
      </div>

      {/* Action : créer une transaction avec les infos du client */}
      <div className="flex justify-end">
        <Link
          to={createTxHref}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <FiPlus className="w-4 h-4" />
          {t('backoffice:crm.clients.detail.createTransaction', { type: t(`backoffice:crm.clients.detail.transactionType.${txType}`) })}
        </Link>
      </div>
    </div>
  )
}
