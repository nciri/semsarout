import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { adminService } from '../../services/adminService'

const STATUS_BADGE = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-amber-100 text-amber-700',
  deleted: 'bg-red-100 text-red-700',
}

function AdminAccounts() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const { data, isLoading } = useQuery(
    ['admin', 'accounts', { q, type, status }],
    () => adminService.getAccounts({ q, type, status, per_page: 50 }),
    { keepPreviousData: true }
  )
  const items = data?.items || []
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">Comptes</h1>
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…"
               className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800">
          <option value="">Tous types</option>
          <option value="user">Utilisateurs</option>
          <option value="agency">Agences</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800">
          <option value="">Tous statuts</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
          <option value="deleted">Supprimés</option>
        </select>
      </div>
      {isLoading ? <p>Chargement…</p> : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Nom</th><th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Plan</th><th className="px-4 py-3">Annonces</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={`${it.kind}-${it.id}`} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link className="text-midnight font-medium hover:underline"
                          to={`/admin/comptes/${it.kind === 'user' ? 'user' : 'agence'}/${it.id}`}>
                      {it.name}
                    </Link>
                    <div className="text-slate-400 text-xs">{it.email}</div>
                  </td>
                  <td className="px-4 py-3">{it.kind === 'user' ? 'Utilisateur' : 'Agence'}</td>
                  <td className="px-4 py-3">{it.plan || '—'}</td>
                  <td className="px-4 py-3">{it.listings_count}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGE[it.status]}`}>
                      {it.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminAccounts
