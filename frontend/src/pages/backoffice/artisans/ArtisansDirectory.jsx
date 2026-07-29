import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiLock, FiTrash2, FiTool, FiPlus, FiEdit2 } from 'react-icons/fi'
import { artisanService } from '../../../services/artisanService'
import { StatCard, Toolbar, Select, SearchInput, DataTable, StatusBadge, EmptyState, Field, Modal, GatedNotice, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const EMPTY = { trade: 'plombier', name: '', company: '', city: '', phone: '', email: '' }
const FORM_FIELDS = [['name', 'Nom *'], ['company', 'Société'], ['city', 'Ville'], ['phone', 'Téléphone'], ['email', 'Email']]

function ArtisansDirectory() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState({ trade: '', city: '', q: '' })
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })
  const { data, isLoading, error } = useQuery(['artisans', filter], () => artisanService.listArtisans(filter), { keepPreviousData: true })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const trades = tradesData?.trades || []
  const tradeLabel = (id) => trades.find((t) => t.id === id)?.label || id

  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')
  const closeModal = () => { setModalOpen(false); setEditingId(null); setForm(EMPTY) }
  const save = useMutation(
    () => (editingId ? artisanService.updateArtisan(editingId, form) : artisanService.createArtisan(form)),
    {
      onSuccess: () => { toast.success(editingId ? 'Artisan modifié' : 'Artisan ajouté'); qc.invalidateQueries('artisans'); closeModal() },
      onError: onErr,
    },
  )
  const del = useMutation((id) => artisanService.deleteArtisan(id), {
    onSuccess: () => { toast.success('Artisan supprimé'); qc.invalidateQueries('artisans') },
    onError: onErr,
  })

  const artisans = data?.artisans || []
  const stats = useMemo(() => ({
    total: artisans.length,
    shared: artisans.filter((a) => a.is_shared).length,
    private: artisans.filter((a) => !a.is_shared).length,
  }), [artisans])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title="Artisans" message="Le référentiel artisans est réservé aux plans Pro et Entreprise." />
  }

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setModalOpen(true) }
  const openEdit = (a) => {
    setEditingId(a.id)
    setForm({ trade: a.trade, name: a.name || '', company: a.company || '', city: a.city || '', phone: a.phone || '', email: a.email || '' })
    setModalOpen(true)
  }

  const columns = [
    { header: 'Nom', className: 'font-medium text-gray-900', cell: (a) => (
      <div className="flex items-center gap-2">
        <span>{a.name}</span>
        <StatusBadge label={a.is_shared ? 'Partagé' : 'Mon agence'} className={a.is_shared ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'} />
      </div>
    ) },
    { header: 'Métier', cell: (a) => <span className="text-gray-600">{tradeLabel(a.trade)}</span> },
    { header: 'Ville', cell: (a) => <span className="text-gray-600">{a.city || '—'}</span> },
    { header: 'Contact', cell: (a) => (
      <div>
        <div className="text-gray-700">{a.phone || '—'}</div>
        {a.email && <div className="text-xs text-gray-400">{a.email}</div>}
      </div>
    ) },
    { header: '', align: 'right', cell: (a) => (
      a.is_shared ? <span className="text-xs text-gray-300">Lecture seule</span> : (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-primary-50 transition-colors" title="Modifier">
            <FiEdit2 className="w-4 h-4" />
          </button>
          <button onClick={() => del.mutate(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Supprimer">
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      )
    ) },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Artisans" value={stats.total} icon={FiTool} />
        <StatCard label="Partagés" value={stats.shared} tone="blue" />
        <StatCard label="Mon agence" value={stats.private} tone="primary" />
      </div>

      <Toolbar>
        <Select value={filter.trade} onChange={(e) => setFilter({ ...filter, trade: e.target.value })}>
          <option value="">Tous les métiers</option>
          {trades.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <input
          value={filter.city}
          onChange={(e) => setFilter({ ...filter, city: e.target.value })}
          placeholder="Ville"
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 w-40"
        />
        <SearchInput value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Rechercher un artisan…" />
        <button onClick={openCreate} className={PRIMARY_BTN}>
          <FiPlus className="w-5 h-5" /> Ajouter
        </button>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={artisans}
        isLoading={isLoading}
        empty={(
          <EmptyState
            icon={FiTool}
            title="Aucun artisan"
            description="Ajustez vos filtres ou ajoutez votre premier artisan privé."
            action={<button onClick={openCreate} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> Ajouter un artisan</button>}
          />
        )}
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Modifier l\'artisan' : 'Ajouter un artisan'}
        footer={(
          <>
            <button onClick={closeModal} className={SECONDARY_BTN}>Annuler</button>
            <button disabled={!form.name || save.isLoading} onClick={() => save.mutate()} className={PRIMARY_BTN}>
              {editingId ? 'Enregistrer' : 'Ajouter'}
            </button>
          </>
        )}
      >
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Métier</label>
          <Select value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} className="w-full">
            {trades.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        </div>
        {FORM_FIELDS.map(([f, ph]) => (
          <Field key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} placeholder={ph} />
        ))}
      </Modal>
    </div>
  )
}
export default ArtisansDirectory
