import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiPlus, FiFileText } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import SearchableSelect from '../../../components/common/SearchableSelect'
import api from '../../../services/api'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice, Modal, Field, Select, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS = {
  draft: ['Brouillon', 'bg-gray-100 text-gray-700'],
  active: ['Actif', 'bg-emerald-50 text-emerald-700'],
  expired: ['Échu', 'bg-amber-100 text-amber-700'],
  terminated: ['Résilié', 'bg-red-100 text-red-700'],
}

function MandatesList() {
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
    onSuccess: () => { toast.success('Mandat créé'); setOpen(false); setForm({ property_id: '', landlord_client_id: '', mandate_type: 'gestion', fee_percent: '' }); qc.invalidateQueries('rental-mandates') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const mandates = data?.mandates || []
  const stats = useMemo(() => ({
    total: mandates.length,
    active: mandates.filter((m) => m.status === 'active').length,
    draft: mandates.filter((m) => m.status === 'draft').length,
  }), [mandates])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title="Gestion locative" message="La gestion locative est réservée aux plans Pro et Entreprise." />
  }
  if (error) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">Une erreur est survenue lors du chargement. Réessayez plus tard.</div>


  const columns = [
    { header: 'Référence', cell: (m) => <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/mandats/${m.id}`}>{m.reference}</Link> },
    { header: 'Type', cell: (m) => <span className="text-gray-600">{m.mandate_type === 'gestion' ? 'Gestion' : 'Location'}</span> },
    { header: 'Honoraires', align: 'right', cell: (m) => <span className="text-gray-700">{m.fee_percent != null ? `${m.fee_percent} %` : '—'}</span> },
    { header: 'Statut', cell: (m) => <StatusBadge label={STATUS[m.status]?.[0] || m.status} className={STATUS[m.status]?.[1]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total mandats" value={stats.total} icon={FiFileText} />
        <StatCard label="Actifs" value={stats.active} tone="green" />
        <StatCard label="Brouillons" value={stats.draft} tone="amber" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> Nouveau mandat</button>
      </div>
      <DataTable columns={columns} rows={mandates} isLoading={isLoading}
        empty={<EmptyState icon={FiFileText} title="Aucun mandat" description="Créez un mandat de gestion pour un propriétaire et un bien." />} />

      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau mandat de gestion"
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={!form.property_id || !form.landlord_client_id || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>Créer</button>
        </>}>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Bien</label>
          <SearchableSelect
            value={form.property_id}
            onChange={setVal('property_id')}
            options={properties.map((p) => ({ value: p.id, label: p.title || p.reference, description: p.city }))}
            placeholder="Choisir un bien…"
            searchPlaceholder="Rechercher un bien…"
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Client bailleur</label>
          <SearchableSelect
            value={form.landlord_client_id}
            onChange={setVal('landlord_client_id')}
            options={clients.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`, description: c.email || c.phone }))}
            placeholder="Choisir un client…"
            searchPlaceholder="Rechercher un client…"
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <Select value={form.mandate_type} onChange={set('mandate_type')} className="w-full">
            <option value="gestion">Gestion</option>
            <option value="location">Location</option>
          </Select>
        </div>
        <Field label="Honoraires (%)" type="number" value={form.fee_percent} onChange={set('fee_percent')} placeholder="ex. 8" />
      </Modal>
    </div>
  )
}
export default MandatesList
