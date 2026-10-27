import { useState } from 'react'
import { useQuery, useMutation } from 'react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiCheck, FiHome, FiRefreshCw } from 'react-icons/fi'
import SearchableSelect from '../../components/common/SearchableSelect'
import api from '../../services/api'
import { MOROCCAN_CITIES } from '../../constants/property'
import { useFormat } from '../../utils/format'
import { PROPERTY_TYPES, STATUSES } from './biens/model'
import { Chip, IconAction, TD, TH } from './components/kit'

const PRIORITY_KEYS = ['low', 'medium', 'high']
const PER_PAGE = 10
const EMPTY_FILTERS = {
  q: '', city: '', type: '', transaction_type: '', status: '',
  neighborhood: '', min_price: '', max_price: '', min_surface: '', min_bedrooms: '',
}

const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
const ctrlCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'

// Le libellé enveloppe le champ : pas de htmlFor à inventer, et le clic porte sur l'ensemble.
function Field({ label, children }) {
  return <label className="block"><span className={labelCls}>{label}</span>{children}</label>
}

// Création d'une TRANSACTION (≠ bien), en deux temps : chercher le bien dans le portefeuille
// de l'agence, puis le relier à un client. Arrivé depuis une fiche client (?client_id=), le
// client est déjà choisi ; arrivé depuis un bien (?property_id=), l'étape de recherche est
// sautée. POST /backoffice/transactions.
function TransactionCreate() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtNumber } = useFormat()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedClient = searchParams.get('client_id') || ''
  const preselectedProperty = searchParams.get('property_id') || ''

  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [property, setProperty] = useState(null)
  const [step, setStep] = useState(preselectedProperty ? 'form' : 'search')
  const [form, setForm] = useState({
    client_id: preselectedClient,
    transaction_type: searchParams.get('type') === 'rent' ? 'rent' : 'sale',
    asking_price: '', expected_closing_date: '', priority: 'medium', notes: '',
  })

  const searchQuery = new URLSearchParams(
    Object.entries({ ...filters, page, per_page: PER_PAGE }).filter(([, v]) => v !== '' && v != null),
  ).toString()
  const { data: results, isFetching } = useQuery(
    ['bo-properties-search', searchQuery],
    async () => (await api.get(`/backoffice/properties?${searchQuery}`)).data,
    { enabled: step === 'search', keepPreviousData: true },
  )
  // Bien passé en paramètre : sans ce chargement, l'écran annoncerait « bien n° 42 ».
  useQuery(['bo-property', preselectedProperty],
    async () => (await api.get(`/backoffice/properties/${preselectedProperty}`)).data, {
      enabled: Boolean(preselectedProperty) && !property,
      onSuccess: (data) => setProperty(data?.property || data),
    })

  // Clients de l'agence de l'agent connecté : le cloisonnement est fait par le service.
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=200')).data)
  // Le client pré-sélectionné peut être hors de cette première page : on le charge à part.
  const { data: pinnedClient } = useQuery(['bo-client', preselectedClient],
    async () => (await api.get(`/backoffice/clients/${preselectedClient}`)).data,
    { enabled: Boolean(preselectedClient) })

  const create = useMutation(() => api.post('/backoffice/transactions', {
    property_id: property?.id ? Number(property.id) : undefined,
    client_id: form.client_id ? Number(form.client_id) : undefined,
    transaction_type: form.transaction_type,
    asking_price: form.asking_price ? Number(form.asking_price) : undefined,
    expected_closing_date: form.expected_closing_date || undefined,
    priority: form.priority,
    notes: form.notes || undefined,
  }).then((r) => r.data), {
    onSuccess: (tx) => { toast.success(t('backoffice:crm.transactions.create.toastSuccess')); navigate(`/backoffice/transactions/${tx.id}`) },
    onError: (e) => toast.error(e.response?.data?.error || t('backoffice:crm.transactions.create.toastError')),
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setFilter = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })) }
  const chooseProperty = (p) => {
    setProperty(p)
    setForm((f) => ({
      ...f,
      transaction_type: p.transaction_type || f.transaction_type,
      asking_price: f.asking_price || (p.price != null ? String(p.price) : ''),
    }))
    setStep('form')
  }

  const rows = results?.properties || []
  const raw = clientsData?.clients || []
  const pinned = pinnedClient?.client || pinnedClient
  const clients = pinned?.id && !raw.some((c) => String(c.id) === String(pinned.id)) ? [pinned, ...raw] : raw
  const pages = results?.pages || 1
  const canSubmit = Boolean(property?.id) && Boolean(form.client_id) && !create.isLoading
  const place = (p) => [p?.city, p?.neighborhood].filter(Boolean).join(', ')

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <IconAction icon={FiArrowLeft} label={t('backoffice:crm.transactions.create.backLink')} to="/backoffice/transactions" className="border border-gray-200 bg-white rtl:[&>svg]:rotate-180" />
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{t('backoffice:crm.transactions.create.pageTitle')}</h1>
          <p className="mt-1 text-gray-500">
            {step === 'search'
              ? t('backoffice:crm.transactions.create.search.subtitle')
              : t('backoffice:crm.transactions.create.subtitle')}
          </p>
        </div>
      </div>

      {step === 'search' ? (
        <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">{t('backoffice:crm.transactions.create.search.filtersTitle')}</h2>
            <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1) }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
              <FiRefreshCw className="h-4 w-4" aria-hidden="true" />{t('backoffice:crm.transactions.create.search.reset')}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('backoffice:crm.transactions.create.search.keyword')}>
              <input value={filters.q} onChange={setFilter('q')} className={ctrlCls}
                placeholder={t('backoffice:crm.transactions.create.search.keywordPlaceholder')} />
            </Field>
            <Field label={t('backoffice:crm.transactions.create.search.city')}>
              <select value={filters.city} onChange={setFilter('city')} className={ctrlCls}>
                <option value="">{t('backoffice:crm.transactions.create.search.any')}</option>
                {MOROCCAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={t('backoffice:crm.transactions.create.search.neighborhood')}>
              <input value={filters.neighborhood} onChange={setFilter('neighborhood')} className={ctrlCls}
                placeholder={t('backoffice:crm.transactions.create.search.neighborhoodPlaceholder')} />
            </Field>
            <Field label={t('backoffice:crm.transactions.create.search.propertyType')}>
              <select value={filters.type} onChange={setFilter('type')} className={ctrlCls}>
                <option value="">{t('backoffice:crm.transactions.create.search.any')}</option>
                {PROPERTY_TYPES.map((k) => <option key={k} value={k}>{t(`backoffice:crm.shared.propertyTypes.${k}`)}</option>)}
              </select>
            </Field>
            <Field label={t('backoffice:crm.transactions.create.search.transaction')}>
              <select value={filters.transaction_type} onChange={setFilter('transaction_type')} className={ctrlCls}>
                <option value="">{t('backoffice:crm.transactions.create.search.any')}</option>
                <option value="sale">{t('backoffice:crm.transactions.type.sale')}</option>
                <option value="rent">{t('backoffice:crm.transactions.type.rent')}</option>
              </select>
            </Field>
            <Field label={t('backoffice:crm.transactions.create.search.status')}>
              <select value={filters.status} onChange={setFilter('status')} className={ctrlCls}>
                <option value="">{t('backoffice:crm.transactions.create.search.any')}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`backoffice:crm.properties.status.${s}`)}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('backoffice:crm.transactions.create.search.minPrice')}>
                <input type="number" min="0" value={filters.min_price} onChange={setFilter('min_price')} className={ctrlCls} />
              </Field>
              <Field label={t('backoffice:crm.transactions.create.search.maxPrice')}>
                <input type="number" min="0" value={filters.max_price} onChange={setFilter('max_price')} className={ctrlCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('backoffice:crm.transactions.create.search.minSurface')}>
                <input type="number" min="0" value={filters.min_surface} onChange={setFilter('min_surface')} className={ctrlCls} />
              </Field>
              <Field label={t('backoffice:crm.transactions.create.search.minBedrooms')}>
                <input type="number" min="0" value={filters.min_bedrooms} onChange={setFilter('min_bedrooms')} className={ctrlCls} />
              </Field>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="mb-2 text-sm text-gray-500">
              {isFetching
                ? t('backoffice:crm.shared.loading')
                : t('backoffice:crm.transactions.create.search.resultsCount', { count: results?.total || 0 })}
            </p>
            {rows.length === 0 && !isFetching ? (
              <p className="py-8 text-center text-sm text-gray-500">{t('backoffice:crm.transactions.create.search.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>{t('backoffice:crm.transactions.create.search.columns.property')}</th>
                      <th className={TH}>{t('backoffice:crm.transactions.create.search.columns.location')}</th>
                      <th className={TH}>{t('backoffice:crm.transactions.create.search.columns.type')}</th>
                      <th className={`${TH} text-end`}>{t('backoffice:crm.transactions.create.search.columns.surface')}</th>
                      <th className={`${TH} text-end`}>{t('backoffice:crm.transactions.create.search.columns.price')}</th>
                      <th className={TH}>{t('backoffice:crm.transactions.create.search.columns.status')}</th>
                      <th className={TH}><span className="sr-only">{t('backoffice:crm.transactions.create.search.choose')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td className={TD}>
                          <span className="font-medium text-gray-900">{p.title || p.reference}</span>
                          <span className="block text-xs text-gray-400">{p.reference}</span>
                        </td>
                        <td className={TD}>{place(p) || '—'}</td>
                        <td className={TD}>
                          {t(`backoffice:crm.shared.propertyTypes.${p.property_type}`, { defaultValue: p.property_type })}
                          {' · '}
                          {t(`backoffice:crm.shared.listingTypes.${p.transaction_type}`, { defaultValue: p.transaction_type })}
                        </td>
                        <td className={`${TD} text-end tabular-nums`}>{p.surface ? `${fmtNumber(p.surface)} m²` : '—'}</td>
                        <td className={`${TD} text-end tabular-nums`}>{p.price != null ? fmtNumber(p.price) : '—'}</td>
                        <td className={TD}>
                          <Chip tone={p.status === 'active' ? 'good' : 'neutral'}>
                            {t(`backoffice:crm.properties.status.${p.status}`, { defaultValue: p.status })}
                          </Chip>
                        </td>
                        <td className={`${TD} text-end`}>
                          <button type="button" onClick={() => chooseProperty(p)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700">
                            <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('backoffice:crm.transactions.create.search.choose')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-3 text-sm">
                <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">
                  {t('backoffice:crm.transactions.create.search.previous')}
                </button>
                <span className="tabular-nums text-gray-500">{page} / {pages}</span>
                <button type="button" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">
                  {t('backoffice:crm.transactions.create.search.next')}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <FiHome className="mt-0.5 h-5 w-5 text-gray-400" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('backoffice:crm.transactions.create.chosenProperty')}</p>
                <p className="font-semibold text-gray-900">{property?.title || property?.reference || '—'}</p>
                <p className="text-sm text-gray-500">
                  {[property?.reference, place(property),
                    property?.surface ? `${fmtNumber(property.surface)} m²` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setStep('search')} className="text-sm font-semibold text-primary-600 hover:text-primary-700">
              {t('backoffice:crm.transactions.create.changeProperty')}
            </button>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('backoffice:crm.transactions.create.clientLabel')}</h2>
            <div className="max-w-xl">
              <SearchableSelect
                value={form.client_id}
                onChange={(v) => setForm((f) => ({ ...f, client_id: v }))}
                options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email || c.phone }))}
                placeholder={t('backoffice:crm.transactions.create.clientPlaceholder')}
                searchPlaceholder={t('backoffice:crm.transactions.create.clientSearchPlaceholder')}
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">{t('backoffice:crm.transactions.create.sectionDetails')}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('backoffice:crm.transactions.create.typeLabel')}>
                <select value={form.transaction_type} onChange={set('transaction_type')} className={ctrlCls}>
                  <option value="sale">{t('backoffice:crm.transactions.type.sale')}</option>
                  <option value="rent">{t('backoffice:crm.transactions.type.rent')}</option>
                </select>
              </Field>
              <Field label={t('backoffice:crm.transactions.create.priceLabel')}>
                <input type="number" min="0" value={form.asking_price} onChange={set('asking_price')} className={ctrlCls}
                  placeholder={t('backoffice:crm.transactions.create.pricePlaceholder')} />
              </Field>
              <Field label={t('backoffice:crm.transactions.create.closingDateLabel')}>
                <input type="date" value={form.expected_closing_date} onChange={set('expected_closing_date')} className={ctrlCls} />
              </Field>
              <Field label={t('backoffice:crm.transactions.create.priorityLabel')}>
                <select value={form.priority} onChange={set('priority')} className={ctrlCls}>
                  {PRIORITY_KEYS.map((p) => <option key={p} value={p}>{t(`backoffice:crm.pipeline.pipeline.priority.${p}`)}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-4">
              <label className={labelCls}>{t('backoffice:crm.transactions.create.notesLabel')}</label>
              <textarea value={form.notes} onChange={set('notes')} rows={3} className={ctrlCls}
                placeholder={t('backoffice:crm.transactions.create.notesPlaceholder')} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400">{t('backoffice:crm.transactions.create.agentNote')}</p>
            <button disabled={!canSubmit} onClick={() => create.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700 disabled:opacity-50">
              {create.isLoading ? t('backoffice:crm.transactions.create.submitting') : t('backoffice:crm.transactions.create.submitButton')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
export default TransactionCreate
