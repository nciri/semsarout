import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiLock, FiInbox, FiPlus, FiX, FiHome, FiStar } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import { DOC_TYPES } from '../../dashboard/applicationStatus'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice, Modal, Field, Select, SearchInput, Toolbar, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS_TONE = {
  received: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-amber-100 text-amber-700',
  shortlist: 'bg-indigo-100 text-indigo-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-700',
}
const MAX_DOC_SIZE = 10 * 1024 * 1024
const EMPTY_FORM = { property_id: '', client_id: '', monthly_income: '', guarantor_name: '', guarantor_income: '' }

function ApplicationsList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('rental-applications', () => rentalService.listApplications())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [docs, setDocs] = useState([])
  const [pendingDocType, setPendingDocType] = useState(DOC_TYPES[0][0])
  const [statusFilter, setStatusFilter] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('')
  const [search, setSearch] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const create = useMutation(
    async () => {
      const created = await rentalService.createApplication({
        property_id: Number(form.property_id),
        client_id: Number(form.client_id),
        monthly_income: form.monthly_income ? Number(form.monthly_income) : null,
        guarantor_name: form.guarantor_name || null,
        guarantor_income: form.guarantor_income ? Number(form.guarantor_income) : null,
      })
      for (const doc of docs) {
        try {
          await rentalService.uploadApplicationDoc(created.id, doc.file, doc.docType)
        } catch {
          toast.error(t('backoffice:rental.application.toasts.uploadFailed', { filename: doc.file.name }))
        }
      }
      return created
    },
    {
      onSuccess: () => {
        toast.success(t('backoffice:rental.application.toasts.created'))
        setOpen(false)
        setForm(EMPTY_FORM)
        setDocs([])
        qc.invalidateQueries('rental-applications')
      },
      onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
    }
  )

  const shortlist = useMutation((id) => rentalService.shortlistApplication(id), {
    onSuccess: () => {
      toast.success(t('backoffice:rental.application.toasts.shortlisted'))
      qc.invalidateQueries('rental-applications')
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  const addDoc = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_DOC_SIZE) { toast.error(t('backoffice:rental.application.toasts.fileTooLarge')); return }
    setDocs((d) => [...d, { docType: pendingDocType, file }])
  }
  const removeDoc = (i) => setDocs((d) => d.filter((_, idx) => idx !== i))

  const apps = data?.applications || []
  const stats = useMemo(() => ({ total: apps.length, received: apps.filter((a) => a.status === 'received').length, accepted: apps.filter((a) => a.status === 'accepted').length }), [apps])

  // Biens distincts (pour le filtre par bien)
  const properties = useMemo(() => {
    const m = new Map()
    for (const a of apps) if (!m.has(a.property_id)) m.set(a.property_id, a.property_title || t('backoffice:rental.application.propertyFallback', { id: a.property_id }))
    return Array.from(m.entries()).map(([id, title]) => ({ id, title }))
  }, [apps, t])

  // Filtres (statut, bien, recherche candidat) puis regroupement par bien
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = apps.filter((a) =>
      (!statusFilter || a.status === statusFilter) &&
      (!propertyFilter || String(a.property_id) === propertyFilter) &&
      (!q || (a.applicant_name || '').toLowerCase().includes(q) || (a.applicant_email || '').toLowerCase().includes(q)))
    const byProperty = new Map()
    for (const a of filtered) {
      if (!byProperty.has(a.property_id)) {
        byProperty.set(a.property_id, { property_id: a.property_id, title: a.property_title, apps: [] })
      }
      byProperty.get(a.property_id).apps.push(a)
    }
    return Array.from(byProperty.values()).sort((x, y) => y.apps.length - x.apps.length)
  }, [apps, statusFilter, propertyFilter, search])

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.application.pageTitle')} message={t('backoffice:rental.application.gated.message')} />
  if (error) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">{t('backoffice:rental.shared.loadError')}</div>

  const columns = [
    { header: t('backoffice:rental.application.columns.candidate'), cell: (a) => (
      <div className="flex items-center gap-2">
        <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/candidatures/${a.id}`}>{a.applicant_name || a.applicant_email || `#${a.id}`}</Link>
        {a.submitted_by_agent_id && <StatusBadge label={t('backoffice:rental.application.badges.submittedByAgency')} className="bg-gray-100 text-gray-600" />}
      </div>
    ) },
    { header: t('backoffice:rental.application.columns.submittedAt'), cell: (a) => <span className="text-gray-600">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('fr-FR') : '—'}</span> },
    { header: t('backoffice:rental.application.columns.monthlyIncome'), align: 'right', cell: (a) => <span className="text-gray-700">{a.monthly_income != null ? `${a.monthly_income} Đh` : '—'}</span> },
    { header: t('backoffice:rental.application.columns.status'), cell: (a) => <StatusBadge label={t(`backoffice:rental.application.status.${a.status}`, { defaultValue: a.status })} className={STATUS_TONE[a.status]} /> },
    { header: '', cell: (a) => (
      ['received', 'reviewing'].includes(a.status) ? (
        <button onClick={() => shortlist.mutate(a.id)} disabled={shortlist.isLoading}
          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          <FiStar className="w-4 h-4" /> {t('backoffice:rental.application.actions.shortlist')}
        </button>
      ) : a.status === 'shortlist' ? (
        <span className="text-sm text-indigo-600">{t('backoffice:rental.application.status.shortlist')}</span>
      ) : null
    ) },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label={t('backoffice:rental.application.stats.total')} value={stats.total} icon={FiInbox} />
        <StatCard label={t('backoffice:rental.application.stats.new')} value={stats.received} tone="blue" />
        <StatCard label={t('backoffice:rental.application.stats.accepted')} value={stats.accepted} tone="green" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> {t('backoffice:rental.application.newButton')}</button>
      </div>

      {apps.length > 0 && (
        <Toolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('backoffice:rental.application.filters.searchPlaceholder')} />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('backoffice:rental.application.filters.allStatuses')}</option>
            {Object.keys(STATUS_TONE).map((value) => <option key={value} value={value}>{t(`backoffice:rental.application.status.${value}`)}</option>)}
          </Select>
          <SearchableSelect
            value={propertyFilter}
            onChange={setPropertyFilter}
            options={properties.map((p) => ({ value: String(p.id), label: p.title, description: p.city }))}
            placeholder={t('backoffice:rental.application.filters.allProperties')}
            searchPlaceholder={t('backoffice:rental.application.filters.propertySearchPlaceholder')}
            clearable
            className="min-w-[12rem]"
          />
        </Toolbar>
      )}

      {isLoading ? (
        <DataTable columns={columns} rows={[]} isLoading />
      ) : apps.length === 0 ? (
        <DataTable columns={columns} rows={[]}
          empty={<EmptyState icon={FiInbox} title={t('backoffice:rental.application.empty.noApplications.title')} description={t('backoffice:rental.application.empty.noApplications.description')} />} />
      ) : groups.length === 0 ? (
        <DataTable columns={columns} rows={[]}
          empty={<EmptyState icon={FiInbox} title={t('backoffice:rental.application.empty.noResults.title')} description={t('backoffice:rental.application.empty.noResults.description')} />} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.property_id} className="space-y-2">
              <div className="flex items-center gap-2">
                <FiHome className="w-4 h-4 text-gray-400" />
                <h2 className="font-semibold text-gray-900">{g.title || t('backoffice:rental.application.propertyFallback', { id: g.property_id })}</h2>
                <span className="text-sm text-gray-400">{t('backoffice:rental.application.groupCount', { count: g.apps.length })}</span>
              </div>
              <DataTable columns={columns} rows={g.apps} />
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t('backoffice:rental.application.modal.title')}
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>{t('backoffice:rental.application.modal.cancel')}</button>
          <button disabled={!form.property_id || !form.client_id || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>{t('backoffice:rental.application.modal.submit')}</button>
        </>}>
        <Field label={t('backoffice:rental.application.modal.propertyIdLabel')} type="number" value={form.property_id} onChange={set('property_id')} />
        <Field label={t('backoffice:rental.application.modal.clientIdLabel')} type="number" value={form.client_id} onChange={set('client_id')} />
        <Field label={t('backoffice:rental.application.modal.monthlyIncomeLabel')} type="number" value={form.monthly_income} onChange={set('monthly_income')} />
        <Field label={t('backoffice:rental.application.modal.guarantorNameLabel')} value={form.guarantor_name} onChange={set('guarantor_name')} />
        <Field label={t('backoffice:rental.application.modal.guarantorIncomeLabel')} type="number" value={form.guarantor_income} onChange={set('guarantor_income')} />

        <div className="mt-4 border-t border-gray-100 pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.application.modal.docsLabel')}</label>
          <div className="flex items-center gap-2">
            <Select value={pendingDocType} onChange={(e) => setPendingDocType(e.target.value)} className="flex-1">
              {DOC_TYPES.map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
            </Select>
            <label className={`${SECONDARY_BTN} cursor-pointer`}>
              <FiPlus className="w-4 h-4" /> {t('backoffice:rental.application.modal.addButton')}
              <input type="file" className="hidden" onChange={addDoc} />
            </label>
          </div>
          {docs.length > 0 && (
            <ul className="mt-3 space-y-2">
              {docs.map((doc, index) => (
                <li key={`${doc.file.name}-${index}`} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-700 truncate">
                    {DOC_TYPES.find(([value]) => value === doc.docType)?.[1] || doc.docType}{' — '}{doc.file.name}
                  </span>
                  <button onClick={() => removeDoc(index)} className="p-1 text-gray-400 hover:text-gray-600"><FiX className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  )
}
export default ApplicationsList
