import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiLock, FiPlus } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'

const STATUS = { open: ['Ouvert', 'bg-blue-100 text-blue-700'], in_progress: ['En cours', 'bg-amber-100 text-amber-700'], closed: ['Clôturé', 'bg-green-100 text-green-700'] }

function LegalCasesList() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('legal-cases', () => legalService.listCases())
  const [title, setTitle] = useState('')
  const [type, setType] = useState('sale')
  const gated = error?.response?.status === 403

  const create = useMutation(() => legalService.createCase({ title: title || undefined, case_type: type }), {
    onSuccess: () => { toast.success('Dossier créé'); setTitle(''); qc.invalidateQueries('legal-cases') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (gated) {
    return (
      <div className="p-8 text-center">
        <FiLock className="mx-auto w-8 h-8 text-gray-400 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Dossiers juridiques</h1>
        <p className="text-gray-500 mt-2">Réservé aux plans Pro et Entreprise.</p>
        <Link to="/dashboard/compte/abonnement" className="btn-primary inline-block mt-4">Voir les offres</Link>
      </div>
    )
  }
  if (isLoading) return <div className="p-8">Chargement…</div>
  const cases = data?.cases || []
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Dossiers juridiques</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-2 items-center">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (optionnel)"
               className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 flex-1 min-w-[200px]" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value="sale">Vente</option><option value="rental">Location</option>
        </select>
        <button onClick={() => create.mutate()} className="btn-primary inline-flex items-center gap-2"><FiPlus /> Nouveau dossier</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr>
            <th className="px-4 py-3">Titre</th><th>Type</th><th>Notaire</th><th>Progression</th><th>Statut</th></tr></thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-3"><Link className="text-primary-600 font-medium" to={`/backoffice/juridique/${c.id}`}>{c.title}</Link></td>
                <td>{c.case_type === 'sale' ? 'Vente' : 'Location'}</td>
                <td>{c.notary?.name || '—'}</td>
                <td>{c.tasks_done}/{c.tasks_total}</td>
                <td><span className={`text-xs px-2 py-1 rounded-full ${STATUS[c.status]?.[1]}`}>{STATUS[c.status]?.[0] || c.status}</span></td>
              </tr>
            ))}
            {cases.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucun dossier.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default LegalCasesList
