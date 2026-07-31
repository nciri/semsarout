import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh']
const isAuthPath = (url = '') => AUTH_PATHS.some((p) => url.includes(p))

api.interceptors.request.use((config) => {
  if (isAuthPath(config.url)) return config
  const raw = localStorage.getItem('auth-storage')
  if (raw) {
    const { state } = JSON.parse(raw)
    if (state?.accessToken) config.headers.Authorization = `Bearer ${state.accessToken}`
  }
  return config
})

export default api
