import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiInbox, FiPlus, FiX, FiHome } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { DOC_TYPES } from '../../dashboard/applicationStatus'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice, Modal, Field, Select, SearchInput, Toolbar, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  reviewing: ['En étude', 'bg-amber-100 text-amber-700'],
  accepted: ['Acceptée', 'bg-emerald-50 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
  withdrawn: ['Retirée', 'bg-gray-100 text-gray-700'],
}
const MAX_DOC_SIZE = 10 * 1024 * 1024
const EMPTY_FORM = { property_id: '', client_id: '', monthly_income: '', guarantor_name: '', guarantor_income: '' }

function ApplicationsList() {
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
          toast.error(`Échec de l'envoi de « ${doc.file.name} »`)
        }
      }
      return created
    },
    {
      onSuccess: () => {
        toast.success('Dossier déposé')
        setOpen(false)
        setForm(EMPTY_FORM)
        setDocs([])
        qc.invalidateQueries('rental-applications')
      },
      onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
    }
  )

  const addDoc = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_DOC_SIZE) { toast.error('Fichier trop volumineux (max 10 Mo)'); return }
    setDocs((d) => [...d, { docType: pendingDocType, file }])
  }
  const removeDoc = (i) => setDocs((d) => d.filter((_, idx) => idx !== i))

  const apps = data?.applications || []
  const stats = useMemo(() => ({ total: apps.length, received: apps.filter((a) => a.status === 'received').length, accepted: apps.filter((a) => a.status === 'accepted').length }), [apps])

  // Biens distincts (pour le filtre par bien)
  const properties = useMemo(() => {
    const m = new Map()
    for (const a of apps) if (!m.has(a.property_id)) m.set(a.property_id, a.property_title || `Bien #${a.property_id}`)
    return Array.from(m.entries()).map(([id, title]) => ({ id, title }))
  }, [apps])

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

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title="Candidatures" message="La gestion locative est réservée aux plans Pro et Entreprise." />
  if (error) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">Une erreur est survenue lors du chargement. Réessayez plus tard.</div>

  const columns = [
    { header: 'Candidat', cell: (a) => (
      <div className="flex items-center gap-2">
        <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/candidatures/${a.id}`}>{a.applicant_name || a.applicant_email || `#${a.id}`}</Link>
        {a.submitted_by_agent_id && <StatusBadge label="Déposé par l'agence" className="bg-gray-100 text-gray-600" />}
      </div>
    ) },
    { header: 'Déposée le', cell: (a) => <span className="text-gray-600">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('fr-FR') : '—'}</span> },
    { header: 'Revenu mensuel', align: 'right', cell: (a) => <span className="text-gray-700">{a.monthly_income != null ? `${a.monthly_income} Đh` : '—'}</span> },
    { header: 'Statut', cell: (a) => <StatusBadge label={STATUS[a.status]?.[0] || a.status} className={STATUS[a.status]?.[1]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total" value={stats.total} icon={FiInbox} />
        <StatCard label="Nouvelles" value={stats.received} tone="blue" />
        <StatCard label="Acceptées" value={stats.accepted} tone="green" />
      </div>
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> Déposer un dossier pour un client</button>
      </div>

      {apps.length > 0 && (
        <Toolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un candidat (nom, email)…" />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS).map(([value, [labelText]]) => <option key={value} value={value}>{labelText}</option>)}
          </Select>
          <Select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
            <option value="">Tous les biens</option>
            {properties.map((p) => <option key={p.id} value={String(p.id)}>{p.title}</option>)}
          </Select>
        </Toolbar>
      )}

      {isLoading ? (
        <DataTable columns={columns} rows={[]} isLoading />
      ) : apps.length === 0 ? (
        <DataTable columns={columns} rows={[]}
          empty={<EmptyState icon={FiInbox} title="Aucune candidature" description="Les dossiers déposés par les candidats sur vos biens apparaissent ici, regroupés par bien." />} />
      ) : groups.length === 0 ? (
        <DataTable columns={columns} rows={[]}
          empty={<EmptyState icon={FiInbox} title="Aucun résultat" description="Aucune candidature ne correspond à vos filtres." />} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.property_id} className="space-y-2">
              <div className="flex items-center gap-2">
                <FiHome className="w-4 h-4 text-gray-400" />
                <h2 className="font-semibold text-gray-900">{g.title || `Bien #${g.property_id}`}</h2>
                <span className="text-sm text-gray-400">· {g.apps.length} candidature{g.apps.length > 1 ? 's' : ''}</span>
              </div>
              <DataTable columns={columns} rows={g.apps} />
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Déposer un dossier pour un client"
        footer={<>
          <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={!form.property_id || !form.client_id || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>Déposer le dossier</button>
        </>}>
        <Field label="ID du bien" type="number" value={form.property_id} onChange={set('property_id')} />
        <Field label="ID du client" type="number" value={form.client_id} onChange={set('client_id')} />
        <Field label="Revenu mensuel (Đh)" type="number" value={form.monthly_income} onChange={set('monthly_income')} />
        <Field label="Nom du garant" value={form.guarantor_name} onChange={set('guarantor_name')} />
        <Field label="Revenu du garant (Đh)" type="number" value={form.guarantor_income} onChange={set('guarantor_income')} />

        <div className="mt-4 border-t border-gray-100 pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Pièces justificatives</label>
          <div className="flex items-center gap-2">
            <Select value={pendingDocType} onChange={(e) => setPendingDocType(e.target.value)} className="flex-1">
              {DOC_TYPES.map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
            </Select>
            <label className={`${SECONDARY_BTN} cursor-pointer`}>
              <FiPlus className="w-4 h-4" /> Ajouter
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
