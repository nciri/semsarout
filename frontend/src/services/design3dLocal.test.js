import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as local from './design3dLocal'
import useAuthStore from '../store/authStore'

const project = (id) => ({ id, target_type: 'property', target_id: 1, title: 'Plan', status: 'draft' })

const asUser = (id) => {
  if (id === null) localStorage.removeItem('userId')
  else localStorage.setItem('userId', String(id))
}

describe('design3dLocal — cloisonnement par compte et purge à la déconnexion', () => {
  beforeEach(async () => {
    asUser(null)
    await local.clearAll()
  })

  afterEach(() => {
    asUser(null)
  })

  it('un agent ne voit jamais les projets du compte précédent sur la même tablette', async () => {
    asUser(1)
    await local.putProject(project('a'.repeat(32)))
    expect(await local.listAllProjects()).toHaveLength(1)

    // L'agent suivant se connecte sur la même tablette.
    asUser(2)
    expect(await local.listAllProjects()).toEqual([])

    // Et le travail du premier ne lui a pas été détruit pour autant.
    asUser(1)
    expect(await local.listAllProjects()).toHaveLength(1)
  })

  it('la file d’attente d’un compte n’est jamais rejouée sous la session du suivant', async () => {
    asUser(1)
    await local.enqueue({ type: 'level.update', payload: { id: 'l'.repeat(32) } })
    expect(await local.pendingCount()).toBe(1)

    asUser(2)
    expect(await local.pendingCount()).toBe(0)
    expect(await local.peek()).toBeNull()
  })

  it('la déconnexion efface les données locales quand rien n’attend d’être synchronisé', async () => {
    asUser(3)
    await local.putProject(project('b'.repeat(32)))
    await local.putLevel({ id: 'l'.repeat(32), project_id: 'b'.repeat(32), name: 'RDC' })

    expect(await local.purgeLocalData(3)).toBe('deleted')

    asUser(3)
    expect(await local.listAllProjects()).toEqual([])
    expect(await local.listLevels('b'.repeat(32))).toEqual([])
  })

  it('la déconnexion conserve un travail non synchronisé — hors de portée du compte suivant', async () => {
    asUser(4)
    await local.putProject(project('c'.repeat(32)))
    await local.enqueue({ type: 'level.update', payload: { id: 'l'.repeat(32) } })

    // Effacer ici détruirait un travail que le serveur n'a jamais reçu : la
    // base est conservée, mais elle porte le nom du compte 4 — le compte
    // suivant ouvre la sienne et n'en voit rien.
    expect(await local.purgeLocalData(4)).toBe('kept')

    asUser(5)
    expect(await local.listAllProjects()).toEqual([])
    asUser(4)
    expect(await local.listAllProjects()).toHaveLength(1)
    expect(await local.pendingCount()).toBe(1)
  })

  it('logout() purge la base des plans, comme il purge le cache du service worker', async () => {
    asUser(6)
    useAuthStore.setState({ user: { id: 6 }, accessToken: 'jeton', isAuthenticated: true })
    await local.putProject(project('d'.repeat(32)))

    await useAuthStore.getState().logout()

    asUser(6)
    expect(await local.listAllProjects()).toEqual([])
  })
})
