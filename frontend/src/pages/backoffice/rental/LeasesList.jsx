import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiPlus, FiHome } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice, Modal, Field, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS = {
  draft: ['Brouillon', 'bg-gray-100 text-gray-700'],
  active: ['Actif', 'bg-emerald-50 text-emerald-700'],
  ended: ['Terminé', 'bg-amber-100 text-amber-700'],
  terminated: ['Résilié', 'bg-red-100 text-red-700'],
}

function LeasesList() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('rental-leases', () => rentalService.listLeases())
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ mandate_id: '', tenant_client_id: '', rent_amount: '', charges_amount: '', deposit_amount: '', payment_day: '1' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const create = useMutation(() => rentalService.createLease({
    mandate_id: Number(form.mandate_id), tenant_client_id: Number(form.tenant_client_id),
    rent_amount: Number(form.rent_amount), charges_amount: form.charges_amount ? Number(form.charges_amount) : 0,
    deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : 0, payment_day: Number(form.payment_day) || 1,
  }), {
    onSuccess: () => { toast.success('Bail créé'); setOpen(false); qc.invalidateQueries('rental-leases') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const leases = data?.leases || []
  const stats = useMemo(() => ({ total: leases.length, active: leases.filter((l) => l.status === 'active').length }), [leases])
  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title="Baux" message="La gestion locative est réservée aux plans Pro et Entreprise." />

  const columns = [
    { header: 'Référence', cell: (l) => <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/baux/${l.id}`}>{l.reference}</Link> },
    { header: 'Loyer', align: 'right', cell: (l) => <span className="text-gray-700">{l.rent_amount} Đh</span> },
    { header: 'Charges', align: 'right', cell: (l) => <span className="text-gray-600">{l.charges_amount ? `${l.charges_amount} Đh` : '—'}</span> },
    { header: 'Statut', cell: (l) => <StatusBadge label={STATUS[l.status]?.[0] || l.status} className={STATUS[l.status]?.[1]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total baux" value={stats.total} icon={FiHome} />
        <StatCard label="Actifs" value={stats.active} tone="green" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> Nouveau bail</button>
      </div>
      <DataTable columns={columns} rows={leases} isLoading={isLoading}
        empty={<EmptyState icon={FiHome} title="Aucun bail" description="Créez un bail rattaché à un mandat de gestion." />} />

      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau bail"
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={!form.mandate_id || !form.tenant_client_id || !form.rent_amount || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>Créer</button>
        </>}>
        <Field label="ID du mandat" type="number" value={form.mandate_id} onChange={set('mandate_id')} />
        <Field label="ID du client locataire" type="number" value={form.tenant_client_id} onChange={set('tenant_client_id')} />
        <Field label="Loyer (Đh)" type="number" value={form.rent_amount} onChange={set('rent_amount')} />
        <Field label="Charges (Đh)" type="number" value={form.charges_amount} onChange={set('charges_amount')} />
        <Field label="Dépôt de garantie (Đh)" type="number" value={form.deposit_amount} onChange={set('deposit_amount')} />
        <Field label="Jour d'échéance (1-28)" type="number" value={form.payment_day} onChange={set('payment_day')} />
      </Modal>
    </div>
  )
}
export default LeasesList
