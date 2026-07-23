import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiTrash2 } from 'react-icons/fi'
import { artisanService } from '../../../services/artisanService'

const EMPTY = { trade: 'plombier', name: '', company: '', city: '', phone: '', email: '' }

function ArtisansDirectory() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState({ trade: '', city: '', q: '' })
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })
  const { data, isLoading, error } = useQuery(['artisans', filter], () => artisanService.listArtisans(filter), { keepPreviousData: true })
  const [form, setForm] = useState(EMPTY)
  const gated = error?.response?.status === 403
  const trades = tradesData?.trades || []
  const tradeLabel = (id) => trades.find((t) => t.id === id)?.label || id

  const create = useMutation(() => artisanService.createArtisan(form), {
    onSuccess: () => { toast.success('Artisan ajouté'); setForm(EMPTY); qc.invalidateQueries('artisans') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const del = useMutation((id) => artisanService.deleteArtisan(id), {
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries('artisans') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (gated) {
    return (
      <div className="p-8 text-center">
        <FiLock className="mx-auto w-8 h-8 text-gray-400 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Artisans</h1>
        <p className="text-gray-500 mt-2">Le référentiel artisans est réservé aux plans Pro et Entreprise.</p>
        <Link to="/dashboard/compte/abonnement" className="btn-primary inline-block mt-4">Voir les offres</Link>
      </div>
    )
  }
  const artisans = data?.artisans || []
  return (
    <div className="p-6 grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Référentiel artisans</h1>
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={filter.trade} onChange={(e) => setFilter({ ...filter, trade: e.target.value })} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
            <option value="">Tous métiers</option>
            {trades.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input value={filter.city} onChange={(e) => setFilter({ ...filter, city: e.target.value })} placeholder="Ville" className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
          <input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Rechercher…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 flex-1 min-w-[160px]" />
        </div>
        {isLoading ? <p>Chargement…</p> : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500"><tr>
                <th className="px-4 py-3">Nom</th><th>Métier</th><th>Ville</th><th>Contact</th><th></th></tr></thead>
              <tbody>
                {artisans.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">{a.name}
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${a.is_shared ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{a.is_shared ? 'Partagé' : 'Mon agence'}</span>
                    </td>
                    <td>{tradeLabel(a.trade)}</td><td>{a.city}</td>
                    <td>{a.phone}<div className="text-xs text-gray-400">{a.email}</div></td>
                    <td className="text-right">{!a.is_shared && <button onClick={() => del.mutate(a.id)} className="text-red-600"><FiTrash2 /></button>}</td>
                  </tr>
                ))}
                {artisans.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucun artisan.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 h-fit">
        <h2 className="font-semibold text-gray-900 mb-3">Ajouter un artisan</h2>
        <select value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 text-gray-900">
          {trades.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {['name', 'company', 'city', 'phone', 'email'].map((f) => (
          <input key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                 placeholder={{ name: 'Nom *', company: 'Société', city: 'Ville', phone: 'Téléphone', email: 'Email' }[f]}
                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 text-gray-900" />
        ))}
        <button disabled={!form.name} onClick={() => create.mutate()} className="btn-primary w-full disabled:opacity-50">Ajouter</button>
      </div>
    </div>
  )
}
export default ArtisansDirectory
