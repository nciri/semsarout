import api from './api'

// Client HTTP pour la lecture PUBLIQUE des plans design3d (visionneuse acheteur).
// Ces routes ne demandent aucune authentification et ne renvoient que des projets
// `ready` (voir services/design3d/app/main.py::public_by_target, implémentée et
// testée en tâche 5) — aucune donnée interne (owner_id/agency_id/tenant/revision)
// n'y transite, le service la filtre déjà.

// Projets publiés (« ready ») d'un bien ou d'un lot de programme, triés du plus
// récent au plus ancien. Tableau vide si aucun n'existe — jamais d'erreur pour
// une cible sans plan.
export const getPublishedByTarget = async (targetType, targetId) => {
  const { data } = await api.get('/public/design3d/by-target', { params: { target_type: targetType, target_id: targetId } })
  return data.projects || []
}

// URL de l'image de fond d'un niveau — n'est jamais renvoyée par le service si
// l'agent ne l'a pas explicitement autorisée pour la lecture publique
// (`DesignLevel.show_background_public`), donc son absence dans le niveau suffit
// à savoir qu'il ne faut rien afficher.
export const publicBackgroundUrl = (levelId) => `/api/v1/public/design3d/levels/${levelId}/background`
