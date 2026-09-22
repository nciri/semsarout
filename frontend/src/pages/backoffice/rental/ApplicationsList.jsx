import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiExternalLink, FiHome, FiInbox, FiLock, FiPlus, FiStar, FiX } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import { DOC_TYPES } from '../../dashboard/applicationStatus'
import { EmptyState, GatedNotice, Modal, Field, Select, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import { Chip, IconAction, TD, TH } from '../components/kit'
import { APP_TONE, groupByProperty, maskEmail, matches } from './model'
import { useRentalFormat } from './hooks'
const MAX_DOC_SIZE = 10 * 1024 * 1024
const EMPTY_FORM = { property_id: '', client_id: '', monthly_income: '', guarantor_name: '', guarantor_income: '' }

function ApplicationsList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const f = useRentalFormat()
  const qc = useQueryClient()
  const location = useLocation()
  const ctx = useOutletContext()
  const { data, isLoading, error } = useQuery('rental-applications', () => rentalService.listApplications())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [docs, setDocs] = useState([])
  const [pendingDocType, setPendingDocType] = useState(DOC_TYPES[0][0])
  const [statusFilter, setStatusFilter] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('')
  const set = (k) => (e) => setForm((v) => ({ ...v, [k]: e.target.value }))

  useEffect(() => { if (location.state?.create) setOpen(true) }, [location.state])

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
        qc.invalidateQueries('rental-summary')
      },
      onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
    }
  )

  const unshortlist = useMutation((id) => rentalService.unshortlistApplication(id), {
    onSuccess: () => {
      toast.success(t('backoffice:rental.application.toasts.unshortlisted'))
      qc.invalidateQueries('rental-applications')
      qc.invalidateQueries('rental-summary')
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  const shortlist = useMutation((id) => rentalService.shortlistApplication(id), {
    onSuccess: () => {
      toast.success(t('backoffice:rental.application.toasts.shortlisted'))
      qc.invalidateQueries('rental-applications')
      qc.invalidateQueries('rental-summary')
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const apps = data?.applications || []
  const q = ctx?.query || ''

  // Biens distincts (pour le filtre par bien)
  const properties = useMemo(() => {
    const m = new Map()
    for (const a of apps) if (!m.has(a.property_id)) m.set(a.property_id, { title: a.property_title || t('backoffice:rental.application.propertyFallback', { id: a.property_id }), city: a.property_city })
    return Array.from(m.entries()).map(([id, p]) => ({ id, ...p }))
  }, [apps, t])

  // Filtres (statut, bien, recherche du registre) puis regroupement par bien
  const groups = useMemo(() => groupByProperty(apps.filter((a) =>
    (!statusFilter || a.status === statusFilter) &&
    (!propertyFilter || String(a.property_id) === propertyFilter) &&
    matches(q, a.applicant_name, a.applicant_email, a.property_title))), [apps, statusFilter, propertyFilter, q])

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.application.pageTitle')} message={t('backoffice:rental.application.gated.message')} />
  if (error) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">{t('backoffice:rental.shared.loadError')}</div>

  const actions = (a) => (
    <span className="inline-flex justify-end">
      {['received', 'reviewing'].includes(a.status) && (
        <IconAction icon={FiStar} label={t('backoffice:rental.application.actions.shortlist')} tone="gold" disabled={shortlist.isLoading} onClick={() => shortlist.mutate(a.id)} />
      )}
      {a.status === 'shortlist' && (
        <IconAction icon={FiStar} label={t('backoffice:rental.application.actions.unshortlist')} disabled={unshortlist.isLoading} onClick={() => unshortlist.mutate(a.id)} className="[&>svg]:fill-current" />
      )}
      <IconAction icon={FiExternalLink} label={t('backoffice:rental.overview.open.application')} to={`/backoffice/gestion-locative/candidatures/${a.id}`} tipAlign="end" />
    </span>
  )

  return (
    <div className="grid gap-3.5">
      {apps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={t('backoffice:rental.application.filters.allStatuses')}>
            <option value="">{t('backoffice:rental.application.filters.allStatuses')}</option>
            {Object.keys(APP_TONE).map((value) => <option key={value} value={value}>{t(`backoffice:rental.application.status.${value}`)}</option>)}
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
        </div>
      )}

      {isLoading ? <div className="h-24 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" />
        : apps.length === 0 ? <EmptyState icon={FiInbox} title={t('backoffice:rental.application.empty.noApplications.title')} description={t('backoffice:rental.application.empty.noApplications.description')} />
          : groups.length === 0 ? <EmptyState icon={FiInbox} title={t('backoffice:rental.application.empty.noResults.title')} description={t('backoffice:rental.application.empty.noResults.description')} />
            : (
              <div className="relative overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr>
                    <th className={TH}>{t('backoffice:rental.application.columns.candidate')}</th>
                    <th className={TH}>{t('backoffice:rental.application.columns.submittedAt')}</th>
                    <th className={`${TH} text-end`}>{t('backoffice:rental.application.columns.monthlyIncome')}</th>
                    <th className={`${TH} text-end`}>{t('backoffice:rental.overview.apps.docs')}</th>
                    <th className={TH}>{t('backoffice:rental.application.columns.status')}</th>
                    <th className={`${TH} text-end`}><span className="sr-only">{t('backoffice:rental.overview.actions')}</span></th>
                  </tr></thead>
                  <tbody>
                    {groups.flatMap((g) => [
                      <tr key={`g-${g.property_id}`}>
                        <td colSpan={6} className={`${TD} bg-gray-50 text-[12.5px] font-bold`}>
                          <FiHome className="me-1.5 inline h-3.5 w-3.5 align-[-2px] text-gray-400" aria-hidden="true" />
                          {g.title || t('backoffice:rental.application.propertyFallback', { id: g.property_id })}
                          <span className="ms-1 font-medium text-gray-500">{t('backoffice:rental.application.groupCount', { count: g.apps.length })}</span>
                        </td>
                      </tr>,
                      ...g.apps.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className={TD}>
                            <Link className="font-semibold text-primary-700 hover:text-primary-800" to={`/backoffice/gestion-locative/candidatures/${a.id}`}>{a.applicant_name || (a.applicant_email && maskEmail(a.applicant_email)) || `#${a.id}`}</Link>
                            {a.submitted_by_agent_id && <span className="ms-1.5 whitespace-nowrap rounded bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-500">{t('backoffice:rental.application.badges.submittedByAgency')}</span>}
                            {a.applicant_email && <span className="block text-xs text-gray-500">{maskEmail(a.applicant_email)}</span>}
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>{a.submitted_at ? f.date(a.submitted_at) : '—'}</td>
                          <td className={`${TD} text-end tabular-nums`}>{a.monthly_income != null ? f.dh(a.monthly_income) : '—'}</td>
                          <td className={`${TD} text-end tabular-nums`}>{a.documents_count ?? '—'}</td>
                          <td className={TD}><Chip tone={APP_TONE[a.status] || 'neutral'}>{t(`backoffice:rental.application.status.${a.status}`, { defaultValue: a.status })}</Chip></td>
                          <td className={`${TD} text-end`}>{actions(a)}</td>
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
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
              {DOC_TYPES.map(([value]) => <option key={value} value={value}>{t(`backoffice:rental.application.modal.docType.${value}`)}</option>)}
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
                    {t(`backoffice:rental.application.modal.docType.${doc.docType}`, { defaultValue: doc.docType })}{' — '}{doc.file.name}
                  </span>
                  <IconAction icon={FiX} label={t('backoffice:rental.overview.removeDoc')} onClick={() => removeDoc(index)} tipAlign="end" />
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
