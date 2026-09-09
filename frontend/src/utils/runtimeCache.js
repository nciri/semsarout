/**
 * Cache d'exécution du service worker (PWA).
 *
 * Un seul cache réseau est autorisé : les LECTURES de plans design3d, seules
 * données que la spec demande de rendre consultables hors ligne. Élargi à tout
 * `/api/`, il mettrait en cache les réponses authentifiées de toute
 * l'application (leads, données de compte…) : sur une tablette partagée elles
 * resteraient lisibles par l'agent suivant.
 *
 * Le nom du cache est partagé avec `vite.config.js` (option `cacheName` du
 * runtimeCaching Workbox) — la même constante des deux côtés, pour que la purge
 * ci-dessous ne puisse pas rater le cache à cause d'un nom désynchronisé.
 *
 * Deux caches DISTINCTS, volontairement : `API_RUNTIME_CACHE` pour les plans de
 * l'agent authentifié (son outil de travail hors-ligne), `PUBLIC_RUNTIME_CACHE`
 * pour les lectures publiques (fiches biens, plans de masse). Un plan de masse
 * de plus de soixante lots — `LotPlanViewer` fait une requête par lot — ne doit
 * jamais évincer le cache que l'agent a constitué pour son propre chantier (I12).
 */
export const API_RUNTIME_CACHE = 'design3d-api'
export const PUBLIC_RUNTIME_CACHE = 'design3d-public-api'

/**
 * Lectures de plans de l'agent authentifié (éditeur design3d). Les écritures
 * sont exclues par l'option `method: 'GET'` de Workbox.
 *
 * ⚠️ Cette fonction est SÉRIALISÉE TELLE QUELLE dans `sw.js` par workbox-build :
 * elle doit rester autonome — aucune référence à une constante, un import ou
 * une autre fonction de ce module, sinon le service worker plante à l'exécution.
 */
export const matchDesign3dAgentRead = ({ url }) =>
  url.pathname.startsWith('/api/v1/design3d/')

/**
 * Lectures publiques de plans (visionneuse d'un bien, plan de masse d'un
 * programme). Volume potentiellement élevé — une visite de programme peut
 * déclencher une requête par lot — donc dans son propre cache, plus petit,
 * plutôt que dans celui de l'agent.
 *
 * ⚠️ Même contrainte de sérialisation que ci-dessus : fonction autonome.
 */
export const matchDesign3dPublicRead = ({ url }) =>
  url.pathname.startsWith('/api/v1/public/design3d/')

/**
 * Vide le cache d'exécution. Appelée à la déconnexion : sur une tablette
 * partagée, les réponses mises en cache pour un compte ne doivent pas rester
 * lisibles par le suivant (un NetworkFirst y retombe dès que le réseau est lent).
 *
 * Ne lève jamais : sans Cache Storage (jsdom, contexte non sécurisé, navigation
 * privée) il n'y a rien à purger, et la déconnexion ne doit pas échouer pour ça.
 * Renvoie `true` seulement si un cache a effectivement été supprimé.
 */
export async function purgeRuntimeCaches() {
  const store = globalThis.caches
  if (!store || typeof store.delete !== 'function') return false
  try {
    return await store.delete(API_RUNTIME_CACHE)
  } catch {
    return false
  }
}
