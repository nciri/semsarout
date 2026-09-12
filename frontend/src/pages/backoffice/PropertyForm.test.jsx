import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import useAuthStore from '../../store/authStore'
import PropertyForm from './PropertyForm'

function renderPropertyForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PropertyForm />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Sans id de route, isEditing=false : le formulaire se rend directement en
// mode "nouveau bien" (pas d'appel réseau bloquant), ancre de rendu stable
// pour vérifier la bascule FR/AR.
describe('PropertyForm i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderPropertyForm()
    expect(await screen.findByText('Nouveau bien')).toBeInTheDocument()
    expect(await screen.findByText('Informations générales')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPropertyForm()
    expect(await screen.findByText('عقار جديد')).toBeInTheDocument()
    expect(await screen.findByText('معلومات عامة')).toBeInTheDocument()
  })
})

function renderForm({ features = [], propertyId = null } = {}) {
  useAuthStore.setState({ user: { id: 1, features }, accessToken: null, isAuthenticated: true })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const entry = propertyId ? `/backoffice/biens/${propertyId}` : '/backoffice/biens/nouveau'
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/backoffice/biens/nouveau" element={<PropertyForm />} />
          <Route path="/backoffice/biens/:id" element={<PropertyForm />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BackofficePropertyForm — entrée design3d', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("désactive l'entrée tant que le bien n'est pas enregistré", () => {
    renderForm({ features: ['design3d'], propertyId: null })
    expect(screen.getByText(/enregistrez d'abord/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Concevoir en 3D/i })).not.toBeInTheDocument()
  })

  it('active l’entrée dès que le bien a un identifiant', async () => {
    renderForm({ features: ['design3d'], propertyId: 42 })
    expect(await screen.findByRole('link', { name: /Concevoir en 3D/i }))
      .toHaveAttribute('href', '/dashboard/conception?target_type=property&target_id=42')
  })
})
