import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiPlus, FiTrash2, FiTrendingUp } from 'react-icons/fi'
import { marketService } from '../../services/marketService'
import useAuthStore from '../../store/authStore'

const LOT_TYPES = [
  { value: '', label: 'Tous types' },
  { value: 'apartment', label: 'Appartement' },
  { value: 'villa', label: 'Villa' },
  { value: 'house', label: 'Maison' },
  { value: 'land', label: 'Terrain' },
  { value: 'commercial', label: 'Local commercial' },
  { value: 'office', label: 'Bureau' }
]

const EMPTY = {
  city: '', neighborhood: '', property_type: '', transaction_type: 'sale',
  avg_price_sqm: '', min_price_sqm: '', max_price_sqm: '', source: 'manuel'
}

export default function MarketPrices() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY)

  const isAdmin = user?.user_type === 'admin' || user?.account_role === 'admin'

  const { data: refs = [], isLoading } = useQuery(
    'market-refs', marketService.getReferences, { enabled: isAdmin }
  )

  const createMutation = useMutation(marketService.createReference, {
    onSuccess: () => { queryClient.invalidateQueries('market-refs'); setForm(EMPTY); toast.success('Référence ajoutée') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur')
  })
  const deleteMutation = useMutation(marketService.deleteReference, {
    onSuccess: () => { queryClient.invalidateQueries('market-refs'); toast.success('Supprimée') }
  })

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">
        Cette page est réservée aux administrateurs.
      </div>
    )
  }

  const submit = (e) => {
    e.preventDefault()
    if (!form.city || !form.neighborhood || !form.avg_price_sqm) {
      toast.error('Ville, quartier et prix/m² moyen requis'); return
    }
    createMutation.mutate({
      ...form,
      property_type: form.property_type || null,
      avg_price_sqm: Number(form.avg_price_sqm),
      min_price_sqm: form.min_price_sqm ? Number(form.min_price_sqm) : null,
      max_price_sqm: form.max_price_sqm ? Number(form.max_price_sqm) : null
    })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center gap-3">
        <FiTrendingUp className="w-8 h-8 text-primary-600" />
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Prix de référence par quartier</h1>
          <p className="text-gray-600">
            Ces prix/m² alimentent la jauge de positionnement sur les annonces (prioritaires sur le calcul automatique).
          </p>
        </div>
      </div>

      {/* Add form */}
      <form onSubmit={submit} className="card p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <input className="input" placeholder="Ville *" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
        <input className="input" placeholder="Quartier *" value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} />
        <select className="input" value={form.transaction_type} onChange={e => setForm({ ...form, transaction_type: e.target.value })}>
          <option value="sale">Vente</option>
          <option value="rent">Location</option>
        </select>
        <select className="input" value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })}>
          {LOT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input className="input" type="number" placeholder="Prix/m² moyen *" value={form.avg_price_sqm} onChange={e => setForm({ ...form, avg_price_sqm: e.target.value })} />
        <input className="input" type="number" placeholder="Min /m²" value={form.min_price_sqm} onChange={e => setForm({ ...form, min_price_sqm: e.target.value })} />
        <input className="input" type="number" placeholder="Max /m²" value={form.max_price_sqm} onChange={e => setForm({ ...form, max_price_sqm: e.target.value })} />
        <button type="submit" disabled={createMutation.isLoading} className="btn-primary justify-center">
          <FiPlus className="w-4 h-4 mr-1" /> Ajouter
        </button>
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 animate-pulse text-gray-400 text-center">Chargement…</div>
        ) : refs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Aucune référence. Ajoutez-en une ci-dessus.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3">Ville</th>
                <th className="px-4 py-3">Quartier</th>
                <th className="px-4 py-3">Transaction</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Moy. /m²</th>
                <th className="px-4 py-3 text-right">Min–Max</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {refs.map(r => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{r.city}</td>
                  <td className="px-4 py-3">{r.neighborhood}</td>
                  <td className="px-4 py-3">{r.transaction_type === 'rent' ? 'Location' : 'Vente'}</td>
                  <td className="px-4 py-3">{LOT_TYPES.find(t => t.value === (r.property_type || ''))?.label || r.property_type}</td>
                  <td className="px-4 py-3 text-right font-medium">{Math.round(r.avg_price_sqm).toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {r.min_price_sqm ? Math.round(r.min_price_sqm).toLocaleString('fr-FR') : '—'} – {r.max_price_sqm ? Math.round(r.max_price_sqm).toLocaleString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.source}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteMutation.mutate(r.id)} className="p-1.5 text-gray-400 hover:text-red-600">
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
