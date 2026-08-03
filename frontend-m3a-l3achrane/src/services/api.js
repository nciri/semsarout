import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh']
const isAuthPath = (url = '') => AUTH_PATHS.some((p) => url.includes(p))

const readAuthState = () => {
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return null
    return JSON.parse(raw)?.state ?? null
  } catch {
    return null
  }
}

api.interceptors.request.use((config) => {
  if (isAuthPath(config.url)) return config
  const state = readAuthState()
  if (state?.accessToken) config.headers.Authorization = `Bearer ${state.accessToken}`
  return config
})

// Miroir du refresh du client semsar (cf. frontend/src/services/api.js) :
// un 401 hors routes d'auth déclenche un unique essai de refresh avant de retenter la requête.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthPath(originalRequest.url)) {
      originalRequest._retry = true

      const state = readAuthState()
      if (state?.refreshToken) {
        try {
          const response = await axios.post('/api/v1/auth/refresh', null, {
            headers: { Authorization: `Bearer ${state.refreshToken}` },
          })

          const newState = { ...state, accessToken: response.data.access_token }
          localStorage.setItem('auth-storage', JSON.stringify({ state: newState }))

          originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`
          return api(originalRequest)
        } catch (refreshError) {
          localStorage.removeItem('auth-storage')
          return Promise.reject(refreshError)
        }
      }
    }

    return Promise.reject(error)
  }
)

export default api
