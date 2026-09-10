import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import useAuthStore from '../../store/authStore'
import api from '../../services/api'
import Properties from './Properties'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), delete: vi.fn() }
}))

function renderProperties() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Properties />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Comme en environnement réel sans serveur : la requête liste échoue, et le
// composant retombe sur son état "liste vide" (crm.properties.list.empty), qui
// sert d'ancre de rendu stable pour vérifier la bascule FR/AR.
describe('Properties i18n', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    api.get.mockReset().mockRejectedValue(new Error('net'))
  })

  it('affiche le titre FR', async () => {
    renderProperties()
    expect(await screen.findByText('Biens immobiliers')).toBeInTheDocument()
    expect(await screen.findByText('Aucun bien trouvé')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderProperties()
    expect(await screen.findByText('العقارات')).toBeInTheDocument()
    expect(await screen.findByText('لا يوجد أي عقار')).toBeInTheDocument()
  })
})

const PROPERTY = {
  id: 1,
  title: 'Villa Anfa',
  city: 'Casablanca',
  status: 'active',
  property_type: 'villa',
  price: 1200000,
  images: [],
}

function renderPropertiesWithData({ features = [] } = {}) {
  useAuthStore.setState({ user: { id: 1, features }, accessToken: null, isAuthenticated: true })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Properties />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BackofficeProperties — entrée design3d', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    api.get.mockReset().mockResolvedValue({ data: { properties: [PROPERTY], pages: 1 } })
  })

  it("propose « Concevoir en 3D » dans le menu d'un bien quand le module est actif", async () => {
    renderPropertiesWithData({ features: ['design3d'] })
    await userEvent.click((await screen.findAllByRole('button', { name: /actions/i }))[0])
    expect(screen.getByText(/Concevoir en 3D/i)).toBeInTheDocument()
  })

  it('ne propose rien quand le module est inactif', async () => {
    renderPropertiesWithData({ features: [] })
    await userEvent.click((await screen.findAllByRole('button', { name: /actions/i }))[0])
    expect(screen.queryByText(/Concevoir en 3D/i)).not.toBeInTheDocument()
  })
})
