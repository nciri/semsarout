import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { adminService } from '../../services/adminService'
import useAuthStore from '../../store/authStore'

function AdminAccountDetail() {
  const { kind, id } = useParams()   // kind: 'user' | 'agence'
  const isUser = kind === 'user'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { startImpersonation } = useAuthStore()

  const { data, isLoading } = useQuery(
    ['admin', 'account', kind, id],
    () => (isUser ? adminService.getUser(id) : adminService.getAgency(id))
  )

  const refresh = () => qc.invalidateQueries(['admin', 'account', kind, id])

  // Mutations are declared directly (not via a non-"use"-prefixed wrapper) so
  // react-hooks/rules-of-hooks can verify they run unconditionally, in a fixed order.
  const suspend = useMutation(
    () => (isUser ? adminService.suspendUser(id, 'Suspendu par admin') : adminService.suspendAgency(id, 'Suspendu par admin')),
    {
      onSuccess: () => { toast.success('Suspendu'); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
    }
  )
  const unsuspend = useMutation(
    () => (isUser ? adminService.unsuspendUser(id) : adminService.unsuspendAgency(id)),
    {
      onSuccess: () => { toast.success('Réactivé'); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
    }
  )
  const del = useMutation(
    () => (isUser ? adminService.deleteUser(id) : adminService.deleteAgency(id)),
    {
      onSuccess: () => { toast.success('Supprimé'); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
    }
  )
  const restore = useMutation(
    () => (isUser ? adminService.restoreUser(id) : adminService.restoreAgency(id)),
    {
      onSuccess: () => { toast.success('Restauré'); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
    }
  )
  const anonymize = useMutation(
    () => (isUser ? adminService.anonymizeUser(id) : adminService.anonymizeAgency(id)),
    {
      onSuccess: () => { toast.success('Anonymisé'); refresh() },
      onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
    }
  )

  if (isLoading) return <p>Chargement…</p>
  const entity = isUser ? data.user : data.agency
  const status = entity.deleted_at ? 'deleted' : (entity.is_suspended ? 'suspended' : 'active')

  const doImpersonate = async () => {
    const res = await adminService.impersonate(id)
    startImpersonation(res.user, res.access_token)
    navigate('/dashboard')
  }

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 mb-4">← Retour</button>
      <h1 className="text-2xl font-bold text-midnight">
        {isUser ? entity.full_name : entity.name}
      </h1>
      <p className="text-slate-500">{entity.email} · statut : {status}</p>
      {entity.deleted_at && (
        <p className="text-red-600 text-sm mt-2">
          Supprimé le {new Date(entity.deleted_at).toLocaleDateString('fr-FR')} — restaurable 90 jours.
        </p>
      )}

      {isUser && (
        <button onClick={doImpersonate}
                className="mt-4 px-4 py-2 rounded-lg bg-midnight text-ivory text-sm">
          Se connecter en tant que cet utilisateur
        </button>
      )}

      <section className="mt-8 border border-red-200 rounded-xl p-5">
        <h2 className="font-semibold text-red-700 mb-3">Zone danger</h2>
        <div className="flex flex-wrap gap-3">
          {status !== 'suspended' && status !== 'deleted' && (
            <button onClick={() => suspend.mutate()} className="px-3 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm">Suspendre</button>
          )}
          {status === 'suspended' && (
            <button onClick={() => unsuspend.mutate()} className="px-3 py-2 rounded-lg bg-green-100 text-green-800 text-sm">Réactiver</button>
          )}
          {status !== 'deleted' && (
            <button onClick={() => del.mutate()} className="px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm">Supprimer</button>
          )}
          {status === 'deleted' && !entity.anonymized_at && (
            <button onClick={() => restore.mutate()} className="px-3 py-2 rounded-lg bg-green-100 text-green-800 text-sm">Restaurer</button>
          )}
          {!entity.anonymized_at && (
            <button onClick={() => anonymize.mutate()} className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm">Anonymiser (RGPD)</button>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-midnight mb-3">Activité</h2>
        <ul className="space-y-2">
          {(data.activity || []).map((a) => (
            <li key={a.id} className="text-sm text-slate-600 border-b border-slate-100 pb-2">
              <span className="font-medium">{a.action}</span> — {a.created_at
                ? new Date(a.created_at).toLocaleString('fr-FR') : ''}
            </li>
          ))}
          {(data.activity || []).length === 0 && <li className="text-slate-400 text-sm">Aucune activité.</li>}
        </ul>
      </section>
    </div>
  )
}

export default AdminAccountDetail
