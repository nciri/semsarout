import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiExternalLink, FiFileText, FiLock } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import api from '../../../services/api'
import { EmptyState, GatedNotice, Modal, Field, Select, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import { Chip, IconAction, TD, TH } from '../components/kit'
import { MANDATE_TONE, maskEmail, maskPhone, matches } from './model'
import { DueChip } from './parts'
import { useRentalFormat } from './hooks'

function MandatesList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const f = useRentalFormat()
  const location = useLocation()
  const ctx = useOutletContext()
  const { data, isLoading, error } = useQuery('rental-mandates', () => rentalService.listMandates())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ property_id: '', landlord_client_id: '', mandate_type: 'gestion', fee_percent: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const { data: propsData } = useQuery('bo-properties-min', async () => (await api.get('/backoffice/properties?per_page=100')).data)
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data)
  const properties = propsData?.properties || []
  const clients = clientsData?.clients || []

  useEffect(() => { if (location.state?.create) setOpen(true) }, [location.state])

  const create = useMutation(() => rentalService.createMandate({
    property_id: Number(form.property_id), landlord_client_id: Number(form.landlord_client_id),
    mandate_type: form.mandate_type, fee_percent: form.fee_percent ? Number(form.fee_percent) : null,
  }), {
    onSuccess: () => { toast.success(t('backoffice:rental.mandate.toasts.created')); setOpen(false); setForm({ property_id: '', landlord_client_id: '', mandate_type: 'gestion', fee_percent: '' }); qc.invalidateQueries('rental-mandates'); qc.invalidateQueries('rental-summary') },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title={t('backoffice:rental.shared.pageTitle')} message={t('backoffice:rental.mandate.gated.message')} />
  }
  if (error) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">{t('backoffice:rental.shared.loadError')}</div>

  const q = ctx?.query || ''
  const mandates = (data?.mandates || []).filter((m) => matches(q, m.reference, m.property_title, m.property_city, m.landlord_name))

  return (
    <div>
      {isLoading ? <div className="h-24 animate-pulse rounded-lg bg-gray-50 motion-reduce:animate-none" aria-busy="true" /> : !data?.mandates?.length ? (
        <EmptyState icon={FiFileText} title={t('backoffice:rental.mandate.empty.title')} description={t('backoffice:rental.mandate.empty.description')} />
      ) : !mandates.length ? <p className="m-0 px-2.5 py-4 text-sm text-gray-500">{t('backoffice:rental.overview.noMatch')}</p> : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={TH}>{t('backoffice:rental.mandate.columns.reference')}</th>
              <th className={TH}>{t('backoffice:rental.overview.mandates.property')}</th>
              <th className={TH}>{t('backoffice:rental.overview.mandates.landlord')}</th>
              <th className={TH}>{t('backoffice:rental.mandate.columns.type')}</th>
              <th className={`${TH} text-end`}>{t('backoffice:rental.mandate.columns.fees')}</th>
              <th className={TH}>{t('backoffice:rental.overview.mandates.end')}</th>
              <th className={TH}>{t('backoffice:rental.mandate.columns.status')}</th>
              <th className={TH}>{t('backoffice:rental.overview.mandates.leased')}</th>
              <th className={`${TH} text-end`}><span className="sr-only">{t('backoffice:rental.overview.actions')}</span></th>
            </tr></thead>
            <tbody>
              {mandates.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>
                    <Link className="font-medium text-primary-700 hover:text-primary-800" to={`/backoffice/gestion-locative/mandats/${m.id}`}>{m.reference}</Link>
                  </td>
                  <td className={TD}><b className="font-semibold">{m.property_title || t('backoffice:rental.application.propertyFallback', { id: m.property_id })}</b><span className="block text-xs text-gray-500">{m.property_city}</span></td>
                  <td className={TD}>{m.landlord_name || '—'}</td>
                  <td className={TD}>{t(`backoffice:rental.mandate.type.${m.mandate_type}`, { defaultValue: m.mandate_type })}</td>
                  <td className={`${TD} text-end tabular-nums`}>{m.fee_percent != null ? `${m.fee_percent} %` : '—'}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {m.end_date ? f.date(m.end_date) : '—'}
                    {m.days_to_end != null && m.days_to_end >= 0 && m.days_to_end <= 90 && <span className="ms-1.5"><DueChip days={m.days_to_end} /></span>}
                  </td>
                  <td className={TD}><Chip tone={MANDATE_TONE[m.status] || 'neutral'}>{t(`backoffice:rental.mandate.status.${m.status}`, { defaultValue: m.status })}</Chip></td>
                  <td className={TD}>
                    {m.active_lease_id
                      ? <Link to={`/backoffice/gestion-locative/baux/${m.active_lease_id}`} className="text-primary-700 hover:text-primary-800">{t('backoffice:rental.overview.mandates.yes')}</Link>
                      : m.status === 'active' ? <Chip tone="warn">{t('backoffice:rental.overview.mandates.vacant')}</Chip> : '—'}
                  </td>
                  <td className={`${TD} text-end`}>
                    <IconAction icon={FiExternalLink} label={t('backoffice:rental.overview.open.mandate')} to={`/backoffice/gestion-locative/mandats/${m.id}`} tone="gold" tipAlign="end" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t('backoffice:rental.mandate.modal.title')}
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>{t('backoffice:rental.mandate.modal.cancel')}</button>
          <button disabled={!form.property_id || !form.landlord_client_id || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>{t('backoffice:rental.mandate.modal.create')}</button>
        </>}>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.mandate.modal.propertyLabel')}</label>
          <SearchableSelect
            value={form.property_id}
            onChange={setVal('property_id')}
            options={properties.map((p) => ({ value: p.id, label: p.title || p.reference, description: p.city }))}
            placeholder={t('backoffice:rental.mandate.modal.propertyPlaceholder')}
            searchPlaceholder={t('backoffice:rental.mandate.modal.propertySearchPlaceholder')}
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.mandate.modal.landlordLabel')}</label>
          <SearchableSelect
            value={form.landlord_client_id}
            onChange={setVal('landlord_client_id')}
            options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email ? maskEmail(c.email) : maskPhone(c.phone) }))}
            placeholder={t('backoffice:rental.mandate.modal.landlordPlaceholder')}
            searchPlaceholder={t('backoffice:rental.mandate.modal.landlordSearchPlaceholder')}
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.mandate.modal.typeLabel')}</label>
          <Select value={form.mandate_type} onChange={set('mandate_type')} className="w-full">
            <option value="gestion">{t('backoffice:rental.mandate.type.gestion')}</option>
            <option value="location">{t('backoffice:rental.mandate.type.location')}</option>
          </Select>
        </div>
        <Field label={t('backoffice:rental.mandate.modal.feesLabel')} type="number" value={form.fee_percent} onChange={set('fee_percent')} placeholder={t('backoffice:rental.mandate.modal.feesPlaceholder')} />
      </Modal>
    </div>
  )
}
export default MandatesList
