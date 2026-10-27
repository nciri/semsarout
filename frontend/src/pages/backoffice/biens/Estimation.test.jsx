import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import Estimation from './Estimation'

const { estimate } = vi.hoisted(() => ({ estimate: vi.fn() }))

vi.mock('../../../services/marketService', () => ({ marketService: { estimate } }))

const RESULTAT = {
  available: true,
  transaction_type: 'sale',
  city: 'Casablanca',
  estimate: 1620000,
  estimate_low: 1490400,
  estimate_high: 1749600,
  price_sqm: 16200,
  reference_price_sqm: 15000,
  adjustment_pct: 8,
  adjustments: [{ code: 'condition_new', pct: 8 }],
  spread_pct: 8,
  confidence: 'high',
  scope: 'manual',
  scope_label: 'référence quartier',
  sample_size: null,
  source: 'manual',
  comparables: [{ id: 1, price: 1500000, surface: 100, price_sqm: 15000, neighborhood: 'Anfa' }],
  currency: 'Dh',
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Estimation /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("Estimation d'un bien", () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    estimate.mockReset()
  })

  it('envoie les paramètres saisis et affiche le prix, la fourchette et sa justification', async () => {
    estimate.mockResolvedValue(RESULTAT)
    renderPage()

    await userEvent.type(screen.getByLabelText('Surface (m²)'), '100')
    await userEvent.type(screen.getByLabelText('Quartier'), 'Anfa')
    await userEvent.click(screen.getByRole('button', { name: 'Estimer' }))

    expect(estimate).toHaveBeenCalledWith(expect.objectContaining({
      city: 'Casablanca', neighborhood: 'Anfa', property_type: 'apartment',
      transaction_type: 'sale', surface: 100,
    }))
    expect(await screen.findByText(/1\s620\s000 Dh/)).toBeInTheDocument()
    expect(screen.getByText(/1\s490\s400 Dh/)).toBeInTheDocument()
    expect(screen.getByText('Estimation fiable')).toBeInTheDocument()
    // Le détail des ajustements : sans lui, l'agent ne peut pas défendre le chiffre.
    expect(screen.getByText('Bien neuf')).toBeInTheDocument()
    expect(screen.getByText('Biens comparables')).toBeInTheDocument()
  })

  it("annonce le manque de comparables au lieu d'afficher un chiffre", async () => {
    estimate.mockResolvedValue({ available: false, reason: 'insufficient_data' })
    renderPage()

    await userEvent.type(screen.getByLabelText('Surface (m²)'), '80')
    await userEvent.click(screen.getByRole('button', { name: 'Estimer' }))

    expect(await screen.findByText(/Pas assez de biens comparables/)).toBeInTheDocument()
    expect(screen.queryByText('Prix estimé')).not.toBeInTheDocument()
  })

  it('rend le titre en arabe après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('تقدير عقار')).toBeInTheDocument()
  })
})
