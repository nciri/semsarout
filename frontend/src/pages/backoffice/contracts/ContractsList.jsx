import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { FiFilePlus, FiLock } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'

const STATUS = { draft: ['Brouillon', 'bg-gray-100 text-gray-700'],
  finalized: ['Finalisé', 'bg-blue-100 text-blue-700'], signed: ['Signé', 'bg-green-100 text-green-700'] }

function ContractsList() {
  const { data, isLoading, error } = useQuery('contracts', () => contractService.list())
  const gated = error?.response?.status === 403
  if (gated) {
    return (
      <div className="p-8 text-center">
        <FiLock className="mx-auto w-8 h-8 text-gray-400 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Contrats</h1>
        <p className="text-gray-500 mt-2">L'édition de contrats est réservée aux plans Pro et Entreprise.</p>
        <Link to="/dashboard/compte/abonnement" className="btn-primary inline-block mt-4">Voir les offres</Link>
      </div>
    )
  }
  if (isLoading) return <div className="p-8">Chargement…</div>
  const rows = data?.contracts || []
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Contrats</h1>
        <Link to="/backoffice/contrats/nouveau" className="btn-primary inline-flex items-center gap-2">
          <FiFilePlus /> Nouveau contrat
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr><th className="px-4 py-3">Titre</th><th>Type</th><th>Statut</th><th>Créé le</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-3"><Link className="text-primary-600 font-medium" to={`/backoffice/contrats/${c.id}`}>{c.title}</Link></td>
                <td>{c.document_type}</td>
                <td><span className={`text-xs px-2 py-1 rounded-full ${STATUS[c.status]?.[1]}`}>{STATUS[c.status]?.[0] || c.status}</span></td>
                <td>{c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : ''}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">Aucun contrat.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default ContractsList
