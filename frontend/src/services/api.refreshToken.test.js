import { describe, it, expect, beforeEach, vi } from 'vitest'

// I11 : le rafraîchissement silencieux du jeton (401 -> POST /auth/refresh)
// doit mettre à jour le store zustand, pas seulement `localStorage` en
// direct — sinon `hasFeature` (qui lit `accessToken` depuis la mémoire du
// store) continue de voir les claims du jeton d'avant, jusqu'à un
// rechargement complet de page ou une reconnexion. Un client qui vient
// d'acheter design3d ne le verrait alors jamais apparaître en cours de
// session.
const { requestUse, responseUse, axiosPost, instanceCall } = vi.hoisted(() => ({
  requestUse: vi.fn(),
  responseUse: vi.fn(),
  axiosPost: vi.fn(),
  instanceCall: vi.fn(async () => ({ data: {} }))
}))

vi.mock('axios', () => ({
  default: {
    create: () => {
      const instance = (...args) => instanceCall(...args)
      instance.interceptors = {
        request: { use: requestUse },
        response: { use: responseUse }
      }
      return instance
    },
    post: axiosPost
  }
}))

function makeToken(claims) {
  const b64 = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`
}

describe('rafraîchissement silencieux du jeton', () => {
  let useAuthStore

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    axiosPost.mockReset()
    instanceCall.mockClear()

    useAuthStore = (await import('../store/authStore')).default
    await import('./api')

    const oldToken = makeToken({ features: [] })
    useAuthStore.setState({
      user: { id: 1 },
      accessToken: oldToken,
      refreshToken: 'refresh-token',
      isAuthenticated: true
    })
    localStorage.setItem('auth-storage', JSON.stringify({ state: useAuthStore.getState() }))
  })

  it('met à jour le store (donc hasFeature) au lieu de ne toucher que localStorage', async () => {
    const newToken = makeToken({ features: ['design3d'] })
    axiosPost.mockResolvedValueOnce({ data: { access_token: newToken } })

    const [, errorHandler] = responseUse.mock.calls.at(-1)
    await errorHandler({
      response: { status: 401 },
      config: { url: '/design3d/projects', headers: {} }
    })

    expect(useAuthStore.getState().accessToken).toBe(newToken)
    expect(useAuthStore.getState().hasFeature('design3d')).toBe(true)
  })

  // Le Header est monté sur TOUTES les pages, publiques comprises, et interroge
  // /my-leads/summary dès que `isAuthenticated` est vrai — ce que l'état persisté reste
  // alors même que la session est expirée. Le 401 qui s'ensuivait menait à
  // `window.location.href = '/connexion'` : un visiteur ouvrant /inscription avec une
  // vieille session était éjecté sur la page de connexion, formulaire inaccessible.
  // La session morte doit être purgée, mais la navigation appartient à PrivateRoute,
  // seul à savoir si la page courante exige d'être connecté.
  it('déconnecte sans rediriger quand le rafraîchissement échoue', async () => {
    axiosPost.mockRejectedValueOnce(new Error('401 refresh'))
    const before = window.location.href

    const [, errorHandler] = responseUse.mock.calls.at(-1)
    // L'intercepteur relaie l'erreur à l'appelant (`Promise.reject`) : c'est voulu, la
    // requête a bien échoué. Seule la navigation ne doit plus lui être imposée.
    await expect(errorHandler({
      response: { status: 401 },
      config: { url: '/my-leads/summary', headers: {} }
    })).rejects.toBeDefined()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(window.location.href).toBe(before)
  })
})
