import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiCheckCircle, FiPlus } from 'react-icons/fi'
import * as local from '../../services/design3dLocal'
import { applyLocal, cleanupEmpty, refreshFromServer } from '../../services/design3dSync'
import { newId } from '../../utils/floorplan'
import useAuthStore from '../../store/authStore'
import Design3dGate from '../../components/design/Design3dGate'

/**
 * Liste des projets de conception d'un bien (ou d'un lot). Hors-ligne d'abord :
 * la liste vient d'IndexedDB, le serveur ne fait que l'enrichir quand il répond ;
 * la création écrit en local et navigue immédiatement, sans attendre le réseau.
 */
export default function DesignProjects() {
  const { t } = useTranslation(['dashboard'])
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const hasFeature = useAuthStore((s) => s.hasFeature)
  const targetType = params.get('target_type') || 'property'
  const targetId = params.get('target_id') ? Number(params.get('target_id')) : null
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [emptyRemoved, setEmptyRemoved] = useState(false)

  const reload = useCallback(async () => {
    const rows = targetId == null ? await local.listAllProjects() : await local.listProjects(targetType, targetId)
    setProjects(rows.filter((p) => !p.deleted))
    setLoading(false)
  }, [targetType, targetId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      // Rattrape ici une session que l'éditeur n'a pas pu nettoyer en quittant (onglet
      // fermé, tablette éteinte — `beforeunload` n'est pas fiable, acquis de la brique 1) :
      // cette liste est le passage obligé pour rouvrir un projet, donc l'endroit sûr pour
      // ce balayage — aucun projet listé ici n'est en cours de dessin.
      const known = targetId == null ? await local.listAllProjects() : await local.listProjects(targetType, targetId)
      let removed = false
      for (const p of known) {
        const r = await cleanupEmpty(p.id).catch(() => ({ removedProject: false }))
        if (r.removedProject) removed = true
      }
      if (alive && removed) setEmptyRemoved(true)
      await reload()
      // Rafraîchissement d'appoint : s'il échoue (hors ligne), la liste locale
      // affichée ci-dessus reste la vérité de travail.
      try {
        await refreshFromServer()
      } catch {
        return
      }
      if (alive) await reload()
    })()
    return () => {
      alive = false
    }
  }, [reload, targetType, targetId])

  async function create() {
    const id = newId()
    await applyLocal({
      type: 'project.create',
      payload: { id, target_type: targetType, target_id: targetId, title: t('dashboard:designEditor.projects.defaultTitle') },
    })
    navigate(`/dashboard/conception/${id}`)
  }

  async function markReady(p) {
    await applyLocal({ type: 'project.update', payload: { id: p.id, status: 'ready' } })
    await reload()
  }

  return (
    <Design3dGate hasFeature={hasFeature('design3d')}>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <Link to="/dashboard/annonces" className="inline-flex items-center gap-2 text-gray-600 min-h-[44px]">
          <FiArrowLeft className="w-4 h-4 rtl:rotate-180" />
          {t('dashboard:designEditor.projects.back')}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{t('dashboard:designEditor.projects.title')}</h1>
        <p className="text-gray-600 mb-4">{t('dashboard:designEditor.projects.subtitle')}</p>

        {emptyRemoved && (
          <p role="status" className="text-sm text-gray-500 mb-4">
            {t('dashboard:designEditor.projects.emptyRemoved')}
          </p>
        )}

        <button type="button" className="btn-primary min-h-[44px] inline-flex items-center gap-2 mb-4" onClick={create}>
          <FiPlus className="w-5 h-5" />
          {t('dashboard:designEditor.projects.create')}
        </button>

        {loading && <p className="text-gray-500">{t('dashboard:shared.loading')}</p>}
        {!loading && projects.length === 0 && <p className="text-gray-500">{t('dashboard:designEditor.projects.empty')}</p>}

        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="card p-3 flex items-center justify-between gap-3">
              <div>
                <Link to={`/dashboard/conception/${p.id}`} className="font-medium text-gray-900 min-h-[44px] inline-flex items-center">
                  {p.title || t('dashboard:designEditor.projects.defaultTitle')}
                </Link>
                <p className="text-sm text-gray-500">
                  {t(`dashboard:designEditor.projects.status.${p.status === 'ready' ? 'ready' : 'draft'}`)}
                  {!p.synced && ` · ${t('dashboard:designEditor.projects.notSynced')}`}
                </p>
                {/* Le statut affiché vient du local : « Prêt » y apparaît dès le
                    clic, même si le serveur a refusé la mise à jour. Sans cette
                    ligne, l'agent croit son plan publié — et `synced` reste vrai
                    dans ce cas, donc le marqueur ci-dessus ne dit rien. */}
                {p.sync_error && (
                  <p role="alert" className="text-sm text-red-700">
                    {t('dashboard:designEditor.projects.syncError', { message: p.sync_error.message })}
                  </p>
                )}
              </div>
              {p.status !== 'ready' && (
                <button type="button" className="btn-secondary min-h-[44px] inline-flex items-center gap-2" onClick={() => markReady(p)}>
                  <FiCheckCircle className="w-4 h-4" />
                  {t('dashboard:designEditor.projects.markReady')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Design3dGate>
  )
}
