import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiCheckCircle, FiAlertTriangle, FiLink2, FiRefreshCw, FiX } from 'react-icons/fi'
import api from '../../../services/api'
import { useFormat } from '../../../utils/format'

const P = 'backoffice:settings.general.integrations'

// Pastille de marque : une lettre et une couleur suffisent, et évitent cinq logos sous licence.
const BRANDS = {
  odoo: { letter: 'O', className: 'bg-purple-100 text-purple-700' },
  sap: { letter: 'S', className: 'bg-blue-100 text-blue-700' },
  salesforce: { letter: 'SF', className: 'bg-sky-100 text-sky-700' },
  hubspot: { letter: 'H', className: 'bg-orange-100 text-orange-700' },
  zoho: { letter: 'Z', className: 'bg-red-100 text-red-700' },
}
const STATUS_CLASS = {
  connected: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  not_connected: 'bg-gray-100 text-gray-600',
}
const SECRET_INPUTS = { password: 'password', token: 'password', access_token: 'password' }

const service = {
  list: async () => (await api.get('/backoffice/integrations')).data,
  connect: async (provider, body) => (await api.put(`/backoffice/integrations/${provider}`, body)).data,
  test: async (provider) => (await api.post(`/backoffice/integrations/${provider}/test`)).data,
  disconnect: async (provider) => (await api.delete(`/backoffice/integrations/${provider}`)).data,
}

const INPUT = 'w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500'

/** Formulaire d'une connexion : les champs sont ceux que le service déclare pour ce tiers. */
function ConnectForm({ integration, onDone, onCancel }) {
  const { t } = useTranslation(['backoffice'])
  const qc = useQueryClient()
  const [values, setValues] = useState(() => Object.fromEntries(integration.fields.map((f) => [f, ''])))
  const [error, setError] = useState(null)

  const connect = useMutation(() => service.connect(integration.provider, values), {
    onSuccess: () => {
      toast.success(t(`${P}.toasts.connected`, { provider: t(`${P}.providers.${integration.provider}.name`) }))
      qc.invalidateQueries('backoffice-integrations')
      onDone()
    },
    // Le message vient du fournisseur (401, instance inconnue) : il est plus utile que le nôtre.
    onError: (e) => setError(e.response?.data?.error || t('backoffice:crm.shared.loadError')),
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setError(null); connect.mutate() }}
      className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-4"
    >
      <p className="text-xs text-gray-500">{t(`${P}.providers.${integration.provider}.help`)}</p>
      {integration.fields.some((f) => f.includes('url') || f === 'api_domain') && (
        <p className="text-xs text-gray-500">{t(`${P}.urlNote`)}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {integration.fields.map((field) => (
          <label key={field} className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">{t(`${P}.fieldLabels.${field}`)}</span>
            <input
              className={INPUT}
              type={SECRET_INPUTS[field] || 'text'}
              autoComplete={SECRET_INPUTS[field] ? 'new-password' : 'off'}
              value={values[field]}
              onChange={(e) => setValues({ ...values, [field]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={connect.isLoading}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
          {connect.isLoading ? t(`${P}.actions.connecting`) : t(`${P}.actions.save`)}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-800">
          {t(`${P}.actions.cancel`)}
        </button>
      </div>
    </form>
  )
}

function Card({ integration }) {
  const { t } = useTranslation(['backoffice'])
  const { fmtDateTime } = useFormat()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const brand = BRANDS[integration.provider] || { letter: '?', className: 'bg-gray-100 text-gray-600' }
  const connected = integration.status !== 'not_connected'

  const test = useMutation(() => service.test(integration.provider), {
    onSuccess: (data) => {
      qc.invalidateQueries('backoffice-integrations')
      if (data.status === 'connected') toast.success(t(`${P}.toasts.tested`))
      else toast.error(data.last_error || t(`${P}.toasts.testFailed`))
    },
  })
  const disconnect = useMutation(() => service.disconnect(integration.provider), {
    onSuccess: () => { qc.invalidateQueries('backoffice-integrations'); toast.success(t(`${P}.toasts.disconnected`)) },
  })

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold ${brand.className}`} aria-hidden="true">
            {brand.letter}
          </div>
          <div>
            <p className="font-medium text-gray-900">{t(`${P}.providers.${integration.provider}.name`)}</p>
            <p className="text-sm text-gray-500">{t(`${P}.providers.${integration.provider}.description`)}</p>
            {integration.account_label && <p className="mt-1 text-xs text-gray-500">{integration.account_label}</p>}
            {integration.status === 'error' && integration.last_error && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-red-700">
                <FiAlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{integration.last_error}
              </p>
            )}
            {integration.last_sync_at && (
              <p className="mt-1 text-xs text-gray-500">
                {t(`${P}.lastSync`, { date: fmtDateTime(integration.last_sync_at), count: integration.synced_count })}
              </p>
            )}
            {!integration.supports_contact_sync && connected && (
              <p className="mt-1 text-xs text-gray-500">{t(`${P}.noContactSync`)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[integration.status]}`}>
            {t(`${P}.status.${integration.status}`)}
          </span>
          {connected ? (
            <>
              <button type="button" onClick={() => test.mutate()} disabled={test.isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                <FiRefreshCw className="h-4 w-4" aria-hidden="true" />{t(`${P}.actions.test`)}
              </button>
              <button type="button" onClick={() => disconnect.mutate()} disabled={disconnect.isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">
                <FiX className="h-4 w-4" aria-hidden="true" />{t(`${P}.actions.disconnect`)}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
              <FiLink2 className="h-4 w-4" aria-hidden="true" />{t(`${P}.actions.connect`)}
            </button>
          )}
        </div>
      </div>
      {open && !connected && (
        <ConnectForm integration={integration} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
      )}
    </div>
  )
}

/** ERP et CRM d'une agence : état réel, connexion vérifiée chez le tiers, envoi des contacts. */
export default function Integrations() {
  const { t } = useTranslation(['backoffice'])
  const { data, isLoading, isError } = useQuery('backoffice-integrations', service.list, { retry: false })
  const rows = data?.integrations || []
  const byKind = (kind) => rows.filter((i) => i.kind === kind)

  if (isLoading) return <p className="text-sm text-gray-500">{t('backoffice:crm.shared.loading')}</p>
  if (isError) return <p className="text-sm text-gray-500">{t('backoffice:crm.shared.loadError')}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
        <FiCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <p>{t(`${P}.intro`)}</p>
      </div>
      {[['erp', 'erpTitle'], ['crm', 'crmTitle']].map(([kind, titleKey]) => (
        <div key={kind} className="space-y-3">
          <h2 className="font-medium text-gray-900">{t(`${P}.${titleKey}`)}</h2>
          {byKind(kind).map((integration) => <Card key={integration.provider} integration={integration} />)}
        </div>
      ))}
    </div>
  )
}
