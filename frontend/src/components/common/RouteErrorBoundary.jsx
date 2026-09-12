import { Component } from 'react'
import { withTranslation } from 'react-i18next'

/**
 * Barrière d'erreur autour de l'arbre des routes.
 *
 * Depuis que chaque page est un fragment chargé à la demande (`lazy()` dans
 * App.jsx), une navigation est une REQUÊTE RÉSEAU qui peut échouer. `<Suspense>`
 * rattrape la suspension, jamais le REJET de la promesse `import()` : sans
 * barrière, ce rejet remonte à la racine, React démonte tout l'arbre et
 * l'utilisateur reste devant un écran blanc, sans message ni moyen de recharger.
 *
 * Le cas n'est pas théorique sur cette PWA : `registerType: 'autoUpdate'`
 * génère un service worker en `skipWaiting()` + `clientsClaim()` +
 * `cleanupOutdatedCaches()`. Un déploiement pendant qu'un agent travaille purge
 * les fragments hachés que l'onglet ouvert — qui exécute encore l'ancien
 * `index-*.js` — va réclamer à la navigation suivante. Le rechargement
 * automatique posé sur `controllerchange` (main.jsx) rend ce scénario rare ;
 * cette barrière est le filet pour tout le reste (coupure réseau, 502 du CDN).
 */
class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false, resetKey: props.resetKey }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  // Changer de route doit laisser une chance à l'application de repartir : une
  // page peut échouer alors que les autres se chargent très bien.
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { failed: false, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error, info) {
    // Pas de collecteur d'erreurs dans ce front : la console reste la seule
    // trace exploitable pour comprendre un incident remonté par un agent.
    console.error('[routes] fragment non chargé', error, info)
  }

  render() {
    const { t, children } = this.props
    if (!this.state.failed) return children

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center" role="alert">
        <p className="text-lg font-semibold text-gray-900">{t('routeError.title')}</p>
        <p className="max-w-md text-sm text-gray-600">{t('routeError.hint')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('routeError.reload')}
        </button>
      </div>
    )
  }
}

// Nommé explicitement : sans cela le composant enveloppé est anonyme et le
// rafraîchissement à chaud de Vite ne sait pas le retrouver.
const TranslatedRouteErrorBoundary = withTranslation()(RouteErrorBoundary)
export default TranslatedRouteErrorBoundary
