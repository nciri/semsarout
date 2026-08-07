import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiLock, FiPlus, FiFileText } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import api from '../../../services/api'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice, Modal, Field, Select, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS_TONE = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-50 text-emerald-700',
  expired: 'bg-amber-100 text-amber-700',
  terminated: 'bg-red-100 text-red-700',
}

function MandatesList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('rental-mandates', () => rentalService.listMandates())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ property_id: '', landlord_client_id: '', mandate_type: 'gestion', fee_percent: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const { data: propsData } = useQuery('bo-properties-min', async () => (await api.get('/backoffice/properties?per_page=100')).data)
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data)
  const properties = propsData?.properties || []
  const clients = clientsData?.clients || []

  const create = useMutation(() => rentalService.createMandate({
    property_id: Number(form.property_id), landlord_client_id: Number(form.landlord_client_id),
    mandate_type: form.mandate_type, fee_percent: form.fee_percent ? Number(form.fee_percent) : null,
  }), {
    onSuccess: () => { toast.success(t('backoffice:rental.mandate.toasts.created')); setOpen(false); setForm({ property_id: '', landlord_client_id: '', mandate_type: 'gestion', fee_percent: '' }); qc.invalidateQueries('rental-mandates') },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mandates = data?.mandates || []
  const stats = useMemo(() => ({
    total: mandates.length,
    active: mandates.filter((m) => m.status === 'active').length,
    draft: mandates.filter((m) => m.status === 'draft').length,
  }), [mandates])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title={t('backoffice:rental.shared.pageTitle')} message={t('backoffice:rental.mandate.gated.message')} />
  }
  if (error) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">{t('backoffice:rental.shared.loadError')}</div>


  const columns = [
    { header: t('backoffice:rental.mandate.columns.reference'), cell: (m) => <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/mandats/${m.id}`}>{m.reference}</Link> },
    { header: t('backoffice:rental.mandate.columns.type'), cell: (m) => <span className="text-gray-600">{t(`backoffice:rental.mandate.type.${m.mandate_type}`, { defaultValue: m.mandate_type })}</span> },
    { header: t('backoffice:rental.mandate.columns.fees'), align: 'right', cell: (m) => <span className="text-gray-700">{m.fee_percent != null ? `${m.fee_percent} %` : '—'}</span> },
    { header: t('backoffice:rental.mandate.columns.status'), cell: (m) => <StatusBadge label={t(`backoffice:rental.mandate.status.${m.status}`, { defaultValue: m.status })} className={STATUS_TONE[m.status]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label={t('backoffice:rental.mandate.stats.total')} value={stats.total} icon={FiFileText} />
        <StatCard label={t('backoffice:rental.mandate.stats.active')} value={stats.active} tone="green" />
        <StatCard label={t('backoffice:rental.mandate.stats.draft')} value={stats.draft} tone="amber" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> {t('backoffice:rental.mandate.newButton')}</button>
      </div>
      <DataTable columns={columns} rows={mandates} isLoading={isLoading}
        empty={<EmptyState icon={FiFileText} title={t('backoffice:rental.mandate.empty.title')} description={t('backoffice:rental.mandate.empty.description')} />} />

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
            options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email || c.phone }))}
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
