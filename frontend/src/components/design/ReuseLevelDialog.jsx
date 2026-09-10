import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Reprise d'un plan déjà tracé — d'un autre étage du même projet comme d'un
 * autre projet de l'agence — pour ne pas refaire un travail déjà fait (Task 10).
 *
 * Le comportement réseau est explicitement dégradé, pas caché : en ligne, tous
 * les projets de l'agence sont proposés (`api.listAgencyProjects`) ; hors ligne,
 * seuls ceux déjà présents sur cet appareil (`local.listKnownProjects`), avec une
 * mention visible disant que la liste est limitée faute de connexion — l'éditeur
 * est hors-ligne d'abord, il ne doit pas donner l'impression d'être cassé quand
 * il est simplement sans réseau.
 *
 * La copie elle-même (régénération des identifiants) est faite par l'appelant
 * (`copyGeometry`) : ce composant ne fait que choisir un niveau et le remonter
 * via `onPick`, géométrie source incluse.
 */
export default function ReuseLevelDialog({ online, local, api, onPick, onClose }) {
  const { t } = useTranslation(['dashboard'])
  const [projects, setProjects] = useState(null)

  useEffect(() => {
    let alive = true
    const load = online ? api.listAgencyProjects() : local.listKnownProjects()
    load
      .then((rows) => {
        if (alive) setProjects(rows || [])
      })
      .catch(() => {
        if (alive) setProjects([])
      })
    return () => {
      alive = false
    }
  }, [online, api, local])

  const entries = (projects || []).flatMap((p) => (p.levels || []).map((level) => ({ project: p, level })))

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-xl sm:rounded-xl p-4 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:designEditor.reuse.title')}</h2>

        {!online && (
          <p role="status" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2 mb-3">
            {t('dashboard:designEditor.reuse.offlineLimited')}
          </p>
        )}

        {projects !== null && entries.length === 0 && (
          <p className="text-sm text-gray-500 mt-2">{t('dashboard:designEditor.reuse.empty')}</p>
        )}

        <ul className="space-y-2 mt-2">
          {entries.map(({ project, level }) => (
            <li key={level.id}>
              <button
                type="button"
                className="w-full text-start min-h-[44px] px-3 py-2 rounded border border-gray-200 hover:bg-gray-50"
                onClick={() => onPick(level)}
              >
                <span className="block font-medium text-gray-900">{project.title}</span>
                <span className="block text-sm text-gray-500">{level.name}</span>
              </button>
            </li>
          ))}
        </ul>

        <button type="button" className="btn-secondary w-full min-h-[44px] mt-4" onClick={onClose}>
          {t('dashboard:designEditor.shelf.close')}
        </button>
      </div>
    </div>
  )
}
