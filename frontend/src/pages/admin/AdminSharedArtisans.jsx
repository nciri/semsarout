import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiTrash2 } from 'react-icons/fi'
import { artisanService } from '../../services/artisanService'

const TRADES = [['plombier', 'Plombier'], ['electricien', 'Électricien'], ['menage', 'Ménage'], ['menuisier', 'Menuisier'],
  ['peintre', 'Peintre'], ['archi_interieur', "Architecte d'intérieur"], ['macon', 'Maçon'], ['chauffagiste', 'Chauffagiste'],
  ['serrurier', 'Serrurier'], ['jardinier', 'Jardinier'], ['autre', 'Autre']]
const EMPTY = { trade: 'plombier', name: '', company: '', city: '', phone: '', email: '' }

function AdminSharedArtisans() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('shared-artisans', () => artisanService.listShared())
  const [form, setForm] = useState(EMPTY)

  const create = useMutation(() => artisanService.createShared(form), {
    onSuccess: () => { toast.success('Artisan partagé ajouté'); setForm(EMPTY); qc.invalidateQueries('shared-artisans') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const del = useMutation((id) => artisanService.deleteShared(id), {
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries('shared-artisans') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (isLoading) return <div>Chargement…</div>
  const artisans = data?.artisans || []
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">Catalogue d'artisans partagé</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr>
              <th className="px-4 py-3">Nom</th><th>Métier</th><th>Ville</th><th></th></tr></thead>
            <tbody>
              {artisans.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td>{TRADES.find((t) => t[0] === a.trade)?.[1] || a.trade}</td><td>{a.city}</td>
                  <td className="text-right"><button onClick={() => del.mutate(a.id)} className="text-red-600"><FiTrash2 /></button></td>
                </tr>
              ))}
              {artisans.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400">Aucun artisan partagé.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 h-fit">
          <h2 className="font-semibold text-midnight mb-3">Ajouter au catalogue</h2>
          <select value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900">
            {TRADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {['name', 'company', 'city', 'phone', 'email'].map((f) => (
            <input key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                   placeholder={{ name: 'Nom *', company: 'Société', city: 'Ville', phone: 'Téléphone', email: 'Email' }[f]}
                   className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900" />
          ))}
          <button disabled={!form.name} onClick={() => create.mutate()} className="w-full px-4 py-2 rounded-lg bg-midnight text-ivory text-sm disabled:opacity-50">Ajouter</button>
        </div>
      </div>
    </div>
  )
}
export default AdminSharedArtisans
