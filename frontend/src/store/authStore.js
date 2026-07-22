import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      impersonating: false,
      impersonatedUser: null,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const response = await api.post('/auth/login', { email, password })
          const { user, access_token, refresh_token } = response.data

          // Store in localStorage for backoffice API calls
          localStorage.setItem('token', access_token)
          localStorage.setItem('userId', String(user.id))

          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isLoading: false
          })

          return { success: true }
        } catch (error) {
          set({ isLoading: false })
          return {
            success: false,
            error: error.response?.data?.error || 'Login failed'
          }
        }
      },

      register: async (userData) => {
        set({ isLoading: true })
        try {
          const response = await api.post('/auth/register', userData)
          const { user, access_token, refresh_token } = response.data

          // Store in localStorage for backoffice API calls
          localStorage.setItem('token', access_token)
          localStorage.setItem('userId', String(user.id))

          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
            isLoading: false
          })

          return { success: true }
        } catch (error) {
          set({ isLoading: false })
          return {
            success: false,
            error: error.response?.data?.error || 'Registration failed'
          }
        }
      },

      logout: () => {
        // Clear localStorage
        localStorage.removeItem('token')
        localStorage.removeItem('userId')

        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false
        })
      },

      updateUser: (userData) => {
        set({ user: { ...get().user, ...userData } })
      },

      startImpersonation: (targetUser, token) => {
        const s = get()
        // Snapshot the super-admin session so we can restore it on exit
        localStorage.setItem('semsar.adminAuth', JSON.stringify({
          user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken,
        }))
        localStorage.setItem('token', token)
        localStorage.setItem('userId', String(targetUser.id))
        set({
          user: targetUser, accessToken: token,
          isAuthenticated: true, impersonating: true, impersonatedUser: targetUser,
        })
      },

      stopImpersonation: () => {
        const raw = localStorage.getItem('semsar.adminAuth')
        localStorage.removeItem('semsar.adminAuth')
        if (!raw) { get().logout(); return }
        const admin = JSON.parse(raw)
        localStorage.setItem('token', admin.accessToken)
        localStorage.setItem('userId', String(admin.user.id))
        set({
          user: admin.user, accessToken: admin.accessToken, refreshToken: admin.refreshToken,
          isAuthenticated: true, impersonating: false, impersonatedUser: null,
        })
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return false

        try {
          const response = await api.post('/auth/refresh', null, {
            headers: { Authorization: `Bearer ${refreshToken}` }
          })
          set({ accessToken: response.data.access_token })
          return true
        } catch (error) {
          get().logout()
          return false
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        impersonating: state.impersonating,
        impersonatedUser: state.impersonatedUser
      })
    }
  )
)

export default useAuthStore
