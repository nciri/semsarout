/**
 * Recharge la page au remplacement du service worker qui la contrôle — mais seulement pour un
 * VRAI remplacement (un déploiement survenu pendant que l'onglet reste ouvert), jamais pour la
 * toute première activation vue par un nouveau visiteur (I13).
 *
 * `registerType: 'autoUpdate'` (skipWaiting + clientsClaim, cf. vite.config.js) fait qu'un
 * premier `controllerchange` arrive même pour un visiteur qui n'avait encore AUCUN service
 * worker : ce n'est pas un déploiement, juste l'installation initiale — recharger à ce moment-là
 * interromprait, par exemple, la saisie d'un formulaire de connexion ou de contact.
 *
 * Distinguer les deux cas exige de suivre l'état au fil des événements, pas seulement au
 * chargement : figer la décision sur le seul `controller` constaté au chargement (comme le
 * faisait une première version de ce correctif) laisse un trou symétrique — un visiteur resté sur
 * l'onglet, dont le tout premier `controllerchange` a été à raison ignoré, ne rechargerait alors
 * JAMAIS pour un vrai déploiement suivant, et retomberait sur le défaut de fragments hachés
 * disparus que ce mécanisme existe pour éviter. `hadController` est donc mis à jour après le
 * premier événement ignoré : tout `controllerchange` suivant est nécessairement un vrai
 * remplacement (un controller existait déjà juste avant), et recharge.
 */
export function installServiceWorkerReload(
  serviceWorkerContainer = (typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined),
  reload = () => window.location.reload()
) {
  if (!serviceWorkerContainer || typeof serviceWorkerContainer.addEventListener !== 'function') return

  let hadController = Boolean(serviceWorkerContainer.controller)
  let reloading = false

  serviceWorkerContainer.addEventListener('controllerchange', () => {
    if (reloading) return
    if (hadController) {
      reloading = true
      reload()
      return
    }
    // Première activation pour ce visiteur (aucun controller avant cet événement) : pas un
    // déploiement. Dès maintenant, un controller existe — le prochain événement en sera un.
    hadController = true
  })
}
