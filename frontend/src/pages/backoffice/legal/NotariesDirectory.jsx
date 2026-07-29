import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiTrash2, FiBriefcase, FiPlus, FiEdit2, FiFilePlus } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'
import { DataTable, EmptyState, Field, Modal, GatedNotice, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const EMPTY = { name: '', office: '', city: '', phone: '', email: '', license_number: '' }
const FIELDS = [
  ['name', 'Nom *'], ['office', 'Étude'], ['city', 'Ville'],
  ['phone', 'Téléphone'], ['email', 'Email'], ['license_number', 'N° agrément'],
]

function NotariesDirectory() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery('notaries', () => legalService.listNotaries())
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY)

  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')
  const closeModal = () => { setModalOpen(false); setEditingId(null); setForm(EMPTY) }

  const save = useMutation(
    () => (editingId ? legalService.updateNotary(editingId, form) : legalService.createNotary(form)),
    {
      onSuccess: () => { toast.success(editingId ? 'Notaire modifié' : 'Notaire ajouté'); qc.invalidateQueries('notaries'); closeModal() },
      onError: onErr,
    },
  )
  const del = useMutation((id) => legalService.deleteNotary(id), {
    onSuccess: () => { toast.success('Notaire supprimé'); qc.invalidateQueries('notaries') },
    onError: onErr,
  })
  const createCase = useMutation((notaryId) => legalService.createCase({ case_type: 'sale', notary_id: notaryId }), {
    onSuccess: (res) => { toast.success('Dossier créé'); qc.invalidateQueries('legal-cases'); navigate(`/backoffice/notaires/dossiers/${res.case.id}`) },
    onError: onErr,
  })

  const notaries = data?.notaries || []
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return notaries
    return notaries.filter((n) => [n.name, n.office, n.city].filter(Boolean).some((v) => v.toLowerCase().includes(s)))
  }, [notaries, q])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title="Notaires" message="L'annuaire des notaires est réservé aux plans Pro et Entreprise." />
  }

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setModalOpen(true) }
  const openEdit = (n) => {
    setEditingId(n.id)
    setForm({ name: n.name || '', office: n.office || '', city: n.city || '', phone: n.phone || '', email: n.email || '', license_number: n.license_number || '' })
    setModalOpen(true)
  }

  const columns = [
    { header: 'Nom', className: 'font-medium text-gray-900', cell: (n) => n.name },
    { header: 'Étude', cell: (n) => <span className="text-gray-600">{n.office || '—'}</span> },
    { header: 'Ville', cell: (n) => <span className="text-gray-600">{n.city || '—'}</span> },
    { header: 'Contact', cell: (n) => (
      <div>
        <div className="text-gray-700">{n.phone || '—'}</div>
        {n.email && <div className="text-xs text-gray-400">{n.email}</div>}
      </div>
    ) },
    { header: '', align: 'right', cell: (n) => (
      <div className="flex items-center justify-end gap-1">
        <button onClick={() => createCase.mutate(n.id)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50 transition-colors" title="Créer un dossier avec ce notaire">
          <FiFilePlus className="w-4 h-4" />
        </button>
        <button onClick={() => openEdit(n)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50 transition-colors" title="Modifier">
          <FiEdit2 className="w-4 h-4" />
        </button>
        <button onClick={() => del.mutate(n.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Supprimer">
          <FiTrash2 className="w-4 h-4" />
        </button>
      </div>
    ) },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un notaire, une étude, une ville…"
          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button onClick={openCreate} className={PRIMARY_BTN}>
          <FiPlus className="w-5 h-5" /> Ajouter un notaire
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        isLoading={isLoading}
        empty={(
          <EmptyState
            icon={FiBriefcase}
            title="Aucun notaire"
            description="Ajoutez votre premier notaire partenaire pour le mobiliser sur vos dossiers."
            action={<button onClick={openCreate} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> Ajouter un notaire</button>}
          />
        )}
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Modifier le notaire' : 'Ajouter un notaire'}
        footer={(
          <>
            <button onClick={closeModal} className={SECONDARY_BTN}>Annuler</button>
            <button disabled={!form.name || save.isLoading} onClick={() => save.mutate()} className={PRIMARY_BTN}>
              {editingId ? 'Enregistrer' : 'Ajouter'}
            </button>
          </>
        )}
      >
        {FIELDS.map(([f, ph]) => (
          <Field key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} placeholder={ph} />
        ))}
      </Modal>
    </div>
  )
}
export default NotariesDirectory
