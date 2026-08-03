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

            // Update stored token
            const newState = { ...state, accessToken: response.data.access_token }
            localStorage.setItem('auth-storage', JSON.stringify({ state: newState }))

            // Retry original request
            originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`
            return api(originalRequest)
          } catch (refreshError) {
            // Clear auth on refresh failure
            localStorage.removeItem('auth-storage')
            window.location.href = '/connexion'
          }
        }
      }
    }

    return Promise.reject(error)
  }
)

export default api
