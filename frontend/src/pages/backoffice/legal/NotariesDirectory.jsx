import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiTrash2 } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'

const EMPTY = { name: '', office: '', city: '', phone: '', email: '', license_number: '' }

function NotariesDirectory() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('notaries', () => legalService.listNotaries())
  const [form, setForm] = useState(EMPTY)
  const gated = error?.response?.status === 403

  const create = useMutation(() => legalService.createNotary(form), {
    onSuccess: () => { toast.success('Notaire ajouté'); setForm(EMPTY); qc.invalidateQueries('notaries') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const del = useMutation((id) => legalService.deleteNotary(id), {
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries('notaries') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (gated) {
    return (
      <div className="p-8 text-center">
        <FiLock className="mx-auto w-8 h-8 text-gray-400 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Notaires</h1>
        <p className="text-gray-500 mt-2">L'annuaire des notaires est réservé aux plans Pro et Entreprise.</p>
        <Link to="/dashboard/compte/abonnement" className="btn-primary inline-block mt-4">Voir les offres</Link>
      </div>
    )
  }
  if (isLoading) return <div className="p-8">Chargement…</div>
  const notaries = data?.notaries || []
  return (
    <div className="p-6 grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Annuaire des notaires</h1>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500"><tr>
              <th className="px-4 py-3">Nom</th><th>Étude</th><th>Ville</th><th>Contact</th><th></th></tr></thead>
            <tbody>
              {notaries.map((n) => (
                <tr key={n.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{n.name}</td><td>{n.office}</td><td>{n.city}</td>
                  <td>{n.phone}<div className="text-xs text-gray-400">{n.email}</div></td>
                  <td className="text-right"><button onClick={() => del.mutate(n.id)} className="text-red-600"><FiTrash2 /></button></td>
                </tr>
              ))}
              {notaries.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucun notaire.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 h-fit">
        <h2 className="font-semibold text-gray-900 mb-3">Ajouter un notaire</h2>
        {['name', 'office', 'city', 'phone', 'email', 'license_number'].map((f) => (
          <input key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                 placeholder={{ name: 'Nom *', office: 'Étude', city: 'Ville', phone: 'Téléphone', email: 'Email', license_number: 'N° agrément' }[f]}
                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 text-gray-900" />
        ))}
        <button disabled={!form.name} onClick={() => create.mutate()} className="btn-primary w-full disabled:opacity-50">Ajouter</button>
      </div>
    </div>
  )
}
export default NotariesDirectory
