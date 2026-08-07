import axios from 'axios'

// Durcissement JWT : les jetons vivent en cookies httpOnly posés par le BFF (jamais en
// localStorage/JS). `withCredentials` fait porter ces cookies sur chaque requête ; le
// serveur les valide (Authorization en repli côté BFF pour les autres clients).
const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh']
const isAuthPath = (url = '') => AUTH_PATHS.some((p) => url.includes(p))

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

// Double-submit CSRF : le cookie m3a_csrf est lisible en JS par construction (sinon le
// front ne pourrait jamais prouver qu'il l'a vu) ; seuls les jetons d'accès/refresh sont
// httpOnly.
function readCsrfCookie() {
  const match = document.cookie.match(/(?:^|;\s*)m3a_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

api.interceptors.request.use((config) => {
  if (isAuthPath(config.url)) return config
  const method = (config.method || 'get').toLowerCase()
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCsrfCookie()
    if (csrf) config.headers['X-CSRF-Token'] = csrf
  }
  return config
})

// Miroir du refresh du client semsar (cf. frontend/src/services/api.js) :
// un 401 hors routes d'auth déclenche un unique essai de refresh (via cookie) avant de
// retenter la requête d'origine.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthPath(originalRequest.url)) {
      originalRequest._retry = true

      try {
        await axios.post('/api/v1/auth/refresh', null, { withCredentials: true })
        return api(originalRequest)
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api
