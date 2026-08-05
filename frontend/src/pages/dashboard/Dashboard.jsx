import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'react-query'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { analyticsService } from '../../services/analyticsService'
import { WIDGETS, Widget } from '../../components/dashboard/widgets'
import useAuthStore from '../../store/authStore'
import MonEspace from './MonEspace'

const DEFAULT = Object.keys(WIDGETS).map((id, i) => ({ id, order: i, hidden: false }))
const SHELL = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'

function Dashboard() {
  const user = useAuthStore((s) => s.user)
  // La « Tour de contrôle » est le tableau de bord AGENCE (overview back-office → 400 sans agence).
  // On ne l'appelle donc que pour un agent d'agence. Superadmin → /admin ; particulier → « Mon espace ».
  const isSuperadmin = !!user?.is_superadmin
  const hasAgency = !!user?.agency_id
  const { data: overview, isLoading, isError, refetch } = useQuery('dashboard-overview', analyticsService.getOverview, { retry: false, enabled: !isSuperadmin && hasAgency })
  const [editing, setEditing] = useState(false)
  const [widgets, setWidgets] = useState(DEFAULT)
  const [dragId, setDragId] = useState(null)

  useEffect(() => {
    const cfg = overview?.config?.widgets
    if (cfg && cfg.length) setWidgets(cfg.filter((w) => WIDGETS[w.id]).sort((a, b) => a.order - b.order))
  }, [overview])

  const save = useMutation(() => analyticsService.saveConfig(widgets.map((w, i) => ({ ...w, order: i }))), {
    onSuccess: () => { toast.success('Tableau de bord enregistré'); setEditing(false) },
    onError: () => toast.error('Erreur'),
  })

  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) return
    const arr = [...widgets]
    const from = arr.findIndex((w) => w.id === dragId)
    const to = arr.findIndex((w) => w.id === targetId)
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    setWidgets(arr)
    setDragId(null)
  }
  const toggleHide = (id) => setWidgets(widgets.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w)))

  if (isSuperadmin) return <Navigate to="/admin" replace />
  if (!hasAgency) return <MonEspace user={user} />
  if (isLoading) return <div className={SHELL}>Chargement…</div>
  if (isError || !overview) {
    return (
      <div className={SHELL}>
        <h1 className="text-2xl font-bold text-gray-900 mb-5">Tour de contrôle</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 mb-1">Impossible de charger le tableau de bord.</p>
          <p className="text-sm text-gray-400 mb-5">Votre session a peut-être expiré.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => refetch()} className="btn-secondary text-sm">Réessayer</button>
            <Link to="/connexion" className="btn-primary text-sm">Se reconnecter</Link>
          </div>
        </div>
      </div>
    )
  }
  const visible = widgets.filter((w) => editing || !w.hidden)

  return (
    <div className={SHELL}>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Tour de contrôle</h1>
        {editing
          ? <div className="flex gap-2">
              <button onClick={() => save.mutate()} className="btn-primary text-sm">Enregistrer</button>
              <button onClick={() => setEditing(false)} className="btn-secondary text-sm">Annuler</button>
            </div>
          : <button onClick={() => setEditing(true)} className="btn-secondary text-sm">Personnaliser</button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visible.map((w) => {
          const def = WIDGETS[w.id]
          if (!def) return null
          return (
            <div key={w.id}
                 draggable={editing}
                 onDragStart={() => setDragId(w.id)}
                 onDragOver={(e) => editing && e.preventDefault()}
                 onDrop={() => onDrop(w.id)}
                 className={`${editing ? 'cursor-move ring-1 ring-dashed ring-gray-300 rounded-xl' : ''} ${w.hidden ? 'opacity-40' : ''}`}>
              {editing && (
                <div className="flex justify-end mb-1">
                  <button onClick={() => toggleHide(w.id)} className="text-xs text-gray-500">
                    {w.hidden ? 'Afficher' : 'Masquer'}
                  </button>
                </div>
              )}
              <Widget titleKey={w.id} to={editing ? null : def.to}>{def.render(overview)}</Widget>
            </div>
          )
        })}
      </div>
    </div>
  )
}
export default Dashboard
