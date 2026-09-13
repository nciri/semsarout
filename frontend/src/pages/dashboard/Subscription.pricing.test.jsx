import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import Subscription from './Subscription'

// Les prix des plans étaient en dur dans `subscriptionPlans.js` : la page montrait aux agences
// des montants que le backend ne connaissait pas. Ils viennent désormais du catalogue, seule
// source, et un tarif absent se dit au lieu d'être inventé.
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const CATALOGUE = {
  services: [],
  plans: [
    { id: 4, slug: 'free', name: 'Gratuit', audience: 'individual', price_monthly: 0, price_yearly: 0 },
    { id: 5, slug: 'basic', name: 'Essentiel', audience: 'individual', price_monthly: 99, price_yearly: 990 },
  ],
}

function renderWith(pricing) {
  api.get.mockImplementation(async (url) => {
    if (url === '/pricing') return { data: pricing }
    return { data: {} }
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><Subscription /></QueryClientProvider>)
}

describe('Subscription — prix issus du catalogue', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('fr')
  })

  it('affiche le montant du catalogue', async () => {
    renderWith(CATALOGUE)
    expect(await screen.findByText(/99/)).toBeInTheDocument()
  })

  it("dit que le tarif est indisponible quand le catalogue ne le porte pas", async () => {
    renderWith({ services: [], plans: [] })
    const messages = await screen.findAllByText(i18n.t('common:pricing.unavailable'))
    expect(messages.length).toBeGreaterThan(0)
  })
})
