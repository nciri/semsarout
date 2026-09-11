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

  it("rend « Concevoir en 3D » comme les autres items du menu, pas comme un bouton", async () => {
    // L'entrée pleine est stylée `btn-secondary` : au milieu d'une liste de
    // lignes de menu, elle apparaissait en bouton, seule de son espèce.
    renderPropertiesWithData({ features: ['design3d'] })
    await userEvent.click((await screen.findAllByRole('button', { name: /actions/i }))[0])
    const item = screen.getByRole('link', { name: /Concevoir en 3D/i })
    const sibling = screen.getByRole('link', { name: /Modifier/i })
    expect(item.className).not.toMatch(/btn-secondary/)
    // Mêmes classes de mise en forme que ses voisins, à l'identique.
    for (const cls of ['flex', 'items-center', 'gap-2', 'px-4', 'py-2', 'text-sm', 'text-gray-700']) {
      expect(sibling.className).toContain(cls)
      expect(item.className).toContain(cls)
    }
  })

  it('ne propose rien quand le module est inactif', async () => {
    renderPropertiesWithData({ features: [] })
    await userEvent.click((await screen.findAllByRole('button', { name: /actions/i }))[0])
    expect(screen.queryByText(/Concevoir en 3D/i)).not.toBeInTheDocument()
  })
})
