import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
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

    // Handle 401 and try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
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
