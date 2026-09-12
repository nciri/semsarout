import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  API_RUNTIME_CACHE, PUBLIC_RUNTIME_CACHE,
  matchDesign3dAgentRead, matchDesign3dPublicRead, purgeRuntimeCaches
} from './runtimeCache'
import useAuthStore from '../store/authStore'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: { post: vi.fn() }
}))

const req = (path) => ({ url: new URL(`https://semsarout.com${path}`) })

function stubCaches(impl) {
  Object.defineProperty(globalThis, 'caches', { configurable: true, writable: true, value: impl })
}

afterEach(() => {
  // jsdom n'expose pas Cache Storage : on rend son absence à l'environnement.
  delete globalThis.caches
  vi.restoreAllMocks()
})

describe('périmètre du cache d’exécution', () => {
  it('met en cache les lectures de plans de l’agent, dans son propre cache', () => {
    expect(matchDesign3dAgentRead(req('/api/v1/design3d/projects/abc'))).toBe(true)
    expect(matchDesign3dAgentRead(req('/api/v1/design3d/levels/abc/background'))).toBe(true)
  })

  it("ne met JAMAIS en cache la sonde de fraîcheur /design3d/sync", () => {
    // `cleanupEmpty` se sert de cette route pour établir qu'un projet est bien
    // vide côté serveur AVANT de le supprimer. Mise en cache, elle rendait —
    // hors ligne, ou dès que le réseau dépassait les cinq secondes du
    // `networkTimeoutSeconds` — un instantané vieux de plusieurs jours dans
    // lequel aucun niveau ne paraissait plus récent que la copie locale : le
    // plan qu'un collègue venait de tracer depuis un autre appareil était
    // jugé inexistant, et détruit. Cette assertion tenait auparavant le
    // contraire pour souhaitable ; c'était le défaut, pas le contrat.
    expect(matchDesign3dAgentRead(req('/api/v1/design3d/sync'))).toBe(false)
  })

  it('met en cache les lectures publiques, dans un cache SÉPARÉ de celui de l’agent (I12)', () => {
    // Un plan de masse de plus de soixante lots ne doit plus pouvoir évincer
    // le cache hors-ligne que l'agent a constitué pour son propre chantier :
    // les deux catégories de lecture ne doivent JAMAIS partager un matcher
    // (donc un cache Workbox) commun.
    expect(matchDesign3dPublicRead(req('/api/v1/public/design3d/by-target'))).toBe(true)
    expect(matchDesign3dAgentRead(req('/api/v1/public/design3d/by-target'))).toBe(false)
    expect(matchDesign3dPublicRead(req('/api/v1/design3d/sync'))).toBe(false)
  })

  it("ne met en cache AUCUNE autre réponse authentifiée de l'application", () => {
    // Régression : un urlPattern sur `/api/` laissait fuiter les données du
    // compte précédent sur une tablette partagée.
    for (const path of [
      '/api/v1/leads',
      '/api/v1/auth/me',
      '/api/v1/properties/1',
      '/api/v1/agencies/2/clients',
      '/api/v1/design3dz/hack',
      '/uploads/plan.png',
    ]) {
      expect(matchDesign3dAgentRead(req(path)), path).toBe(false)
      expect(matchDesign3dPublicRead(req(path)), path).toBe(false)
    }
  })
})

describe('purgeRuntimeCaches', () => {
  it('a un nom distinct du cache public (I12)', () => {
    expect(API_RUNTIME_CACHE).not.toBe(PUBLIC_RUNTIME_CACHE)
  })


  it('ne fait rien et ne lève pas sans Cache Storage', async () => {
    await expect(purgeRuntimeCaches()).resolves.toBe(false)
  })

  it('supprime le cache design3d', async () => {
    const del = vi.fn(async () => true)
    stubCaches({ delete: del })
    await expect(purgeRuntimeCaches()).resolves.toBe(true)
    expect(del).toHaveBeenCalledWith(API_RUNTIME_CACHE)
  })

  it('avale une erreur du Cache Storage plutôt que de la propager', async () => {
    stubCaches({ delete: vi.fn(async () => { throw new Error('SecurityError') }) })
    await expect(purgeRuntimeCaches()).resolves.toBe(false)
  })
})

describe('déconnexion', () => {
  it('purge le cache du service worker en plus du state et du localStorage', async () => {
    const del = vi.fn(async () => true)
    stubCaches({ delete: del })
    localStorage.setItem('token', 'x')
    localStorage.setItem('userId', '1')
    useAuthStore.setState({ user: { id: 1 }, accessToken: 'a', refreshToken: 'r', isAuthenticated: true })

    useAuthStore.getState().logout()

    expect(del).toHaveBeenCalledWith(API_RUNTIME_CACHE)
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('userId')).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('se déconnecte quand même si le Cache Storage échoue', async () => {
    stubCaches({ delete: vi.fn(async () => { throw new Error('QuotaExceeded') }) })
    useAuthStore.setState({ user: { id: 1 }, accessToken: 'a', isAuthenticated: true })
    expect(() => useAuthStore.getState().logout()).not.toThrow()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

// I10 : sur une tablette partagée, l'agent B qui se connecte directement (sans
// que A se soit déconnecté), s'inscrit, ou usurpe/quitte une identité, ne doit
// jamais hériter du cache design3d-api constitué sous une autre identité.
describe('changement d’identité', () => {
  afterEach(() => {
    useAuthStore.setState({
      user: null, accessToken: null, refreshToken: null, isAuthenticated: false,
      impersonating: false, impersonatedUser: null
    })
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('purge le cache du service worker à la connexion', async () => {
    const del = vi.fn(async () => true)
    stubCaches({ delete: del })
    api.post.mockResolvedValueOnce({
      data: { user: { id: 2 }, access_token: 'a', refresh_token: 'r' }
    })

    await useAuthStore.getState().login('b@example.com', 'pw')

    expect(del).toHaveBeenCalledWith(API_RUNTIME_CACHE)
  })

  it('purge le cache du service worker à l’inscription', async () => {
    const del = vi.fn(async () => true)
    stubCaches({ delete: del })
    api.post.mockResolvedValueOnce({
      data: { user: { id: 3 }, access_token: 'a', refresh_token: 'r' }
    })

    await useAuthStore.getState().register({ email: 'c@example.com' })

    expect(del).toHaveBeenCalledWith(API_RUNTIME_CACHE)
  })

  it('purge le cache du service worker au démarrage d’une usurpation d’identité', () => {
    const del = vi.fn(async () => true)
    stubCaches({ delete: del })
    useAuthStore.setState({ user: { id: 1 }, accessToken: 'admin-token', refreshToken: 'admin-refresh' })

    useAuthStore.getState().startImpersonation({ id: 42 }, 'target-token')

    expect(del).toHaveBeenCalledWith(API_RUNTIME_CACHE)
  })

  it('purge le cache du service worker à la sortie d’une usurpation d’identité', () => {
    const del = vi.fn(async () => true)
    stubCaches({ delete: del })
    localStorage.setItem('semsar.adminAuth', JSON.stringify({
      user: { id: 1 }, accessToken: 'admin-token', refreshToken: 'admin-refresh'
    }))
    useAuthStore.setState({ user: { id: 42 }, accessToken: 'target-token', impersonating: true, impersonatedUser: { id: 42 } })

    useAuthStore.getState().stopImpersonation()

    expect(del).toHaveBeenCalledWith(API_RUNTIME_CACHE)
  })
})
