import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'
import { purgeRuntimeCaches } from '../utils/runtimeCache'
import { purgeLocalData } from '../services/design3dLocal'

// Entitlements de plan. Le serveur les pose dans les claims du jeton d'accès
// (identity/app/auth.py::_claims, monolithe backend/app/api/v1/auth.py) : c'est
// la source qui fait foi côté passerelle, et la seule disponible pour les
// sessions déjà ouvertes. `user.features` (renvoyé par /auth/me) la double pour
// les comptes rafraîchis depuis le profil.
function claimsOf(token) {
  if (!token) return {}
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

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
        // Les plans hors-ligne (IndexedDB) appartiennent eux aussi au compte
        // qui se déconnecte : sans cette purge, l'agent suivant sur la même
        // tablette ouvrirait ses projets, ses niveaux et ses images de fond, et
        // sa file d'attente repartirait sous le jeton du nouveau venu.
        // L'identifiant est passé explicitement : `localStorage` est vidé juste
        // en dessous. Purge non attendue, comme celle du service worker.
        const purged = purgeLocalData(get().user?.id ?? null)

        // Clear localStorage
        localStorage.removeItem('token')
        localStorage.removeItem('userId')

        // Les réponses design3d mises en cache par le service worker
        // appartiennent au compte qui se déconnecte : sur une tablette
        // partagée elles resteraient lisibles par l'utilisateur suivant.
        // Purge asynchrone volontairement non attendue — la déconnexion est
        // immédiate et ne doit jamais dépendre du Cache Storage (absent en
        // navigation privée ou hors contexte sécurisé).
        purgeRuntimeCaches()

        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false
        })

        // Rendue pour les seuls appelants qui veulent attendre la purge (tests) ;
        // la déconnexion, elle, est immédiate.
        return purged
      },

      hasFeature: (name) => {
        const { user, accessToken } = get()
        if (Array.isArray(user?.features)) return user.features.includes(name)
        const features = claimsOf(accessToken).features
        return Array.isArray(features) && features.includes(name)
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
          user: targetUser, accessToken: token, refreshToken: null,
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
