import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import OnboardingCard from './OnboardingCard'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../services/api', () => ({ default: { get } }))

const STATE = {
  completed: 2, total: 8, progress: 25, complete: false, next: 'publish_property',
  steps: [
    { key: 'agency_profile', done: true, href: '/backoffice/parametres' },
    { key: 'first_property', done: true, href: '/backoffice/biens' },
    { key: 'publish_property', done: false, href: '/backoffice/biens' },
    { key: 'commission_settings', done: false, href: '/backoffice/parametres' },
    { key: 'invite_team', done: false, href: '/backoffice/equipe' },
    { key: 'first_client', done: false, href: '/backoffice/clients' },
    { key: 'first_visit', done: false, href: '/backoffice/visites' },
    { key: 'subscription_active', done: false, href: '/dashboard/compte/abonnement' },
  ],
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><OnboardingCard /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Mise en route', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    try { localStorage.clear() } catch { /* stockage indisponible */ }
    get.mockReset()
    get.mockResolvedValue({ data: STATE })
  })

  it('montre l’avancement et lie chaque étape restante', async () => {
    renderCard()
    expect(await screen.findByText('2 étapes sur 8')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Publier un bien' })).toHaveAttribute('href', '/backoffice/biens')
    // Une étape faite n'est plus un lien à cliquer.
    expect(screen.queryByRole('link', { name: "Compléter le profil de l'agence" })).not.toBeInTheDocument()
  })

  it('disparaît quand tout est fait', async () => {
    get.mockResolvedValue({ data: { ...STATE, complete: true, completed: 8, progress: 100 } })
    const { container } = renderCard()
    await vi.waitFor(() => expect(get).toHaveBeenCalled())
    expect(container.querySelector('section')).toBeNull()
  })

  it('se masque à la demande et reste masquée', async () => {
    renderCard()
    await userEvent.click(await screen.findByRole('button', { name: 'Masquer la mise en route' }))
    expect(screen.queryByText('2 étapes sur 8')).not.toBeInTheDocument()
    expect(localStorage.getItem('onboarding-hidden')).toBe('1')
  })
})
