import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
