import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiLock, FiPlus, FiHome } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import api from '../../../services/api'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice, Modal, Field, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS_TONE = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-50 text-emerald-700',
  ended: 'bg-amber-100 text-amber-700',
  terminated: 'bg-red-100 text-red-700',
}

function LeasesList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('rental-leases', () => rentalService.listLeases())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ mandate_id: '', tenant_client_id: '', rent_amount: '', charges_amount: '', deposit_amount: '', payment_day: '1' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const { data: mandatesData } = useQuery('rental-mandates', () => rentalService.listMandates())
  const { data: clientsData } = useQuery('bo-clients-min', async () => (await api.get('/backoffice/clients?per_page=100')).data)
  const mandates = mandatesData?.mandates || []
  const clients = clientsData?.clients || []

  const create = useMutation(() => rentalService.createLease({
    mandate_id: Number(form.mandate_id), tenant_client_id: Number(form.tenant_client_id),
    rent_amount: Number(form.rent_amount), charges_amount: form.charges_amount ? Number(form.charges_amount) : 0,
    deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : 0, payment_day: Number(form.payment_day) || 1,
  }), {
    onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.created')); setOpen(false); qc.invalidateQueries('rental-leases') },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const leases = data?.leases || []
  const stats = useMemo(() => ({ total: leases.length, active: leases.filter((l) => l.status === 'active').length }), [leases])
  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.shared.pageTitle')} message={t('backoffice:rental.lease.gated.message')} />
  if (error) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">{t('backoffice:rental.shared.loadError')}</div>

  const columns = [
    { header: t('backoffice:rental.lease.columns.reference'), cell: (l) => <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/baux/${l.id}`}>{l.reference}</Link> },
    { header: t('backoffice:rental.lease.columns.rent'), align: 'right', cell: (l) => <span className="text-gray-700">{l.rent_amount} Đh</span> },
    { header: t('backoffice:rental.lease.columns.charges'), align: 'right', cell: (l) => <span className="text-gray-600">{l.charges_amount ? `${l.charges_amount} Đh` : '—'}</span> },
    { header: t('backoffice:rental.lease.columns.status'), cell: (l) => <StatusBadge label={t(`backoffice:rental.lease.status.${l.status}`, { defaultValue: l.status })} className={STATUS_TONE[l.status]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label={t('backoffice:rental.lease.stats.total')} value={stats.total} icon={FiHome} />
        <StatCard label={t('backoffice:rental.lease.stats.active')} value={stats.active} tone="green" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> {t('backoffice:rental.lease.newButton')}</button>
      </div>
      <DataTable columns={columns} rows={leases} isLoading={isLoading}
        empty={<EmptyState icon={FiHome} title={t('backoffice:rental.lease.empty.title')} description={t('backoffice:rental.lease.empty.description')} />} />

      <Modal open={open} onClose={() => setOpen(false)} title={t('backoffice:rental.lease.modal.title')}
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>{t('backoffice:rental.lease.modal.cancel')}</button>
          <button disabled={!form.mandate_id || !form.tenant_client_id || !form.rent_amount || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>{t('backoffice:rental.lease.modal.create')}</button>
        </>}>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.lease.modal.mandateLabel')}</label>
          <SearchableSelect
            value={form.mandate_id}
            onChange={setVal('mandate_id')}
            options={mandates.map((m) => ({ value: m.id, label: m.reference, description: m.mandate_type === 'gestion' ? t('backoffice:rental.mandate.type.gestion') : t('backoffice:rental.mandate.type.location') }))}
            placeholder={t('backoffice:rental.lease.modal.mandatePlaceholder')}
            searchPlaceholder={t('backoffice:rental.lease.modal.mandateSearchPlaceholder')}
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.lease.modal.tenantLabel')}</label>
          <SearchableSelect
            value={form.tenant_client_id}
            onChange={setVal('tenant_client_id')}
            options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email || c.phone }))}
            placeholder={t('backoffice:rental.lease.modal.tenantPlaceholder')}
            searchPlaceholder={t('backoffice:rental.lease.modal.tenantSearchPlaceholder')}
          />
        </div>
        <Field label={t('backoffice:rental.lease.modal.rentLabel')} type="number" value={form.rent_amount} onChange={set('rent_amount')} />
        <Field label={t('backoffice:rental.lease.modal.chargesLabel')} type="number" value={form.charges_amount} onChange={set('charges_amount')} />
        <Field label={t('backoffice:rental.lease.modal.depositLabel')} type="number" value={form.deposit_amount} onChange={set('deposit_amount')} />
        <Field label={t('backoffice:rental.lease.modal.paymentDayLabel')} type="number" value={form.payment_day} onChange={set('payment_day')} />
      </Modal>
    </div>
  )
}
export default LeasesList
