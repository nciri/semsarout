import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Endpoints d'authentification : ne jamais y attacher un token (un token périmé
// ferait échouer la connexion elle-même) ni tenter de refresh/redirect sur leur 401.
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password']
const isAuthPath = (url = '') => AUTH_PATHS.some((p) => url.includes(p))

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    if (isAuthPath(config.url)) return config
    const authStorage = localStorage.getItem('auth-storage')
    if (authStorage) {
      const { state } = JSON.parse(authStorage)
      if (state?.accessToken) {
        config.headers.Authorization = `Bearer ${state.accessToken}`
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Handle 401 and try to refresh token (jamais pour les routes d'auth :
    // un 401 de /auth/login = mauvais identifiants, à remonter tel quel)
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthPath(originalRequest.url)) {
      originalRequest._retry = true

      const authStorage = localStorage.getItem('auth-storage')
      if (authStorage) {
        const { state } = JSON.parse(authStorage)
        if (state?.refreshToken) {
          try {
            const response = await axios.post('/api/v1/auth/refresh', null, {
              headers: { Authorization: `Bearer ${state.refreshToken}` }
            })

            // Passer par le store plutôt qu'écrire `localStorage` en direct :
            // `hasFeature` lit `accessToken` depuis la mémoire du store, pas
            // depuis `localStorage`. Un achat de module en cours de session
            // resterait invisible jusqu'à un rechargement complet sinon (I11).
            // `useAuthStore.setState` persiste lui-même dans `localStorage`
            // (middleware `persist`), donc les deux restent synchronisés.
            // Import différé pour éviter le cycle statique authStore -> api.
            const { default: useAuthStore } = await import('../store/authStore')
            useAuthStore.setState({ accessToken: response.data.access_token })

            // Retry original request
            originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`
            return api(originalRequest)
          } catch (refreshError) {
            // Session morte : on purge, mais on NE navigue PAS.
            //
            // Le Header est monté sur toutes les pages, publiques comprises, et interroge
            // /my-leads/summary dès que `isAuthenticated` est vrai — ce que l'état persisté
            // reste alors même que la session a expiré. La redirection en dur qui vivait ici
            // éjectait donc vers /connexion un visiteur simplement venu sur /inscription, en
            // rechargeant tout le document et sans mémoriser d'où il venait (contrairement à
            // PrivateRoute, qui passe `state.from`).
            //
            // `logout()` fait déjà la purge complète (localStorage + caches du service
            // worker). Sur une page protégée, PrivateRoute voit `isAuthenticated` retomber et
            // redirige lui-même, avec le retour ; sur une page publique, l'utilisateur reste
            // où il est. Le routage appartient au routeur.
            const { default: useAuthStore } = await import('../store/authStore')
            useAuthStore.getState().logout()
          }
        }
      }
    }

    return Promise.reject(error)
  }
)

export default api
