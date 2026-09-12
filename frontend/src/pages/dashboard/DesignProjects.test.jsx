import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import * as local from '../../services/design3dLocal'
import useAuthStore from '../../store/authStore'
import DesignProjects from './DesignProjects'

// Serveur injoignable : mode nominal de la liste, qui vit d'abord d'IndexedDB.
vi.mock('../../services/design3dApi', () => {
  const netErr = () => Object.assign(new Error('net'), { code: 'ERR_NETWORK' })
  return {
    createProject: vi.fn(() => Promise.reject(netErr())),
    listProjects: vi.fn(() => Promise.reject(netErr())),
    getProject: vi.fn(() => Promise.reject(netErr())),
    updateProject: vi.fn(() => Promise.reject(netErr())),
    deleteProject: vi.fn(() => Promise.reject(netErr())),
    sync: vi.fn(() => Promise.reject(netErr())),
  }
})

const PROJECT_ID = 'p1'

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/conception?target_type=property&target_id=1']}>
      <DesignProjects />
    </MemoryRouter>,
  )
}

describe('DesignProjects', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    await local.clearAll()
    useAuthStore.setState({ user: { id: 1, features: ['design3d'] }, accessToken: null, isAuthenticated: true })
  })

  it('dit qu’un projet marqué « Prêt » n’a pas été accepté par le serveur', async () => {
    // `markReady` écrit `status: 'ready'` en local et la liste l'affiche : si le
    // PUT échoue, l'agent croit son plan publié alors que le serveur ne l'a
    // jamais accepté. `synced` reste vrai (le projet existe côté serveur), donc
    // le marqueur « non synchronisé » ne dit rien non plus.
    await local.putProject({
      id: PROJECT_ID, target_type: 'property', target_id: 1, title: 'Villa', status: 'ready', synced: true,
      sync_error: { code: 422, message: 'Statut invalide', at: 1 },
    })
    renderList()

    expect(await screen.findByText('Villa')).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Statut invalide')
  })

  it('n’affiche aucune alerte pour un projet sans échec', async () => {
    await local.putProject({
      id: PROJECT_ID, target_type: 'property', target_id: 1, title: 'Villa', status: 'ready', synced: true,
    })
    renderList()
    expect(await screen.findByText('Villa')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // --- C2 : hors ligne, le nettoyage ne supprime rien sur le serveur --------
  // Scénario de DESTRUCTION : la tablette B a tiré le projet quand il était
  // encore vide, un collègue a tracé le plan depuis A, et B ouvre la liste sans
  // réseau. Balayer sur cet instantané périmé met un `project.delete` en file ;
  // au retour du réseau, le travail du collègue est détruit.
  it('ne met aucune suppression en file quand le serveur est injoignable', async () => {
    await local.putProject({ id: PROJECT_ID, target_type: 'property', target_id: 1, title: 'Villa', synced: true })
    await local.putLevel({
      id: 'l1', project_id: PROJECT_ID, name: 'RDC', position: 0, revision: 0, base_revision: 0,
      wall_height_m: 2.7, calibration: null, geometry: { walls: [], rooms: [], openings: [] }, dirty: false,
    })
    renderList()

    // Le projet reste affiché tel qu'il est connu ici : hors ligne, le
    // nettoyage est reporté, pas exécuté sur des données périmées.
    expect(await screen.findByText('Villa')).toBeInTheDocument()
    await waitFor(async () => expect(await local.pendingCount()).toBe(0))
    expect(await local.getProject(PROJECT_ID)).toBeDefined()
    expect(await local.getLevel('l1')).toBeDefined()
  })
})
