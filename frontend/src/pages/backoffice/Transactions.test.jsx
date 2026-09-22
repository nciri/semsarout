import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import Transactions from './Transactions'

const TX = [
  {
    id: 9, reference: 'TX-202607-0009', property_id: 4, property_title: 'Villa Souissi', property_city: 'Rabat',
    client_id: 3, client_name: 'Rachid Kettani', seller_id: 21, seller_name: 'Youssef Chaoui', agent_id: 18, agent_name: 'Omar Benali',
    transaction_type: 'sale', stage: 'negotiation', status: 'lost', lost_reason: 'Prix trop élevé',
    asking_price: 6820000, offer_price: 6720318.4, final_price: null, commission_rate: 3, expected_commission: 201609.55,
    probability: 79, contact_date: '2026-07-24T00:30:00', expected_closing_date: '2026-09-12T00:00:00', closed_at: '2026-07-12T00:00:00',
  },
  {
    id: 20, reference: 'TX-202607-0020', property_id: 85, property_title: 'Appartement Malabata', property_city: 'Tanger',
    client_id: 11, client_name: 'Salma Idrissi', agent_id: 17, agent_name: 'Fatima Zahra',
    transaction_type: 'rent', stage: 'application', status: 'active', asking_price: 15000, offer_price: 14213.3,
    commission_rate: 3.5, expected_commission: 497.47, probability: 57, contact_date: '2026-07-24T00:30:00',
    expected_closing_date: '2026-10-15T00:00:00',
  },
]
const bucket = (a, w, l) => ({ active: a, won: w, lost: l })
const SUMMARY = {
  sale: bucket({ count: 11, amount: 38900000, commission: 1100000, weighted_commission: 820000 }, { count: 1, amount: 783661, commission: 27428 }, { count: 3, amount: 9900000 }),
  rent: bucket({ count: 3, amount: 29000, commission: 900, weighted_commission: 600 }, { count: 1, amount: 2831, commission: 71 }, { count: 1, amount: 14000 }),
  lost_reasons: [{ reason: 'Prix trop élevé', count: 2 }, { reason: 'Client a trouvé ailleurs', count: 2 }],
  agents: [{ id: 17, name: 'Fatima Zahra', count: 6 }, { id: 18, name: 'Omar Benali', count: 7 }],
}

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }))

function renderPage() {
  api.get.mockImplementation(async (url) => ({
    data: url.endsWith('/summary') ? SUMMARY : { transactions: TX, total: 2, pages: 1, current_page: 1 },
  }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><Transactions /></MemoryRouter></QueryClientProvider>)
}

describe('Registre des transactions', () => {
  beforeEach(async () => {
    api.get.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('affiche le titre et les actions en icônes, en FR puis en AR', async () => {
    const { unmount } = renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nouvelle transaction' })).toHaveAttribute('href', '/backoffice/transactions/nouveau')
    unmount()
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'المعاملات' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'معاملة جديدة' })).toBeInTheDocument()
  })

  it('sépare vente et location dans la synthèse et nomme le premier motif de perte', async () => {
    renderPage()
    const card = (await screen.findByRole('heading', { name: 'En cours' })).closest('section')
    expect(within(card).getByText('Vente')).toBeInTheDocument()
    expect(within(card).getByText('Location')).toBeInTheDocument()
    expect(within(card).getByText(/38,9\sM Dh/)).toBeInTheDocument()
    expect(within(card).getByText(/29\s000 Dh\/mois/)).toBeInTheDocument()
    const lost = screen.getByRole('heading', { name: 'Perdues' }).closest('section')
    expect(within(lost).getByText('Prix trop élevé')).toBeInTheDocument()
  })

  it('montre le motif de perte dans la ligne et déplie une seule fiche, refermée par Échap', async () => {
    const user = userEvent.setup()
    renderPage()
    const row = (await screen.findByText('Villa Souissi')).closest('tr')
    expect(within(row).getAllByText('Prix trop élevé').length).toBeGreaterThan(0)

    await user.click(within(row).getByRole('button', { name: 'Déplier la fiche' }))
    expect(screen.getByText('Youssef Chaoui')).toBeInTheDocument()
    expect(screen.getByText('Perdue le')).toBeInTheDocument()
    expect(screen.getByText('79 %')).toBeInTheDocument()

    const other = screen.getByText('Appartement Malabata').closest('tr')
    await user.click(within(other).getByRole('button', { name: 'Déplier la fiche' }))
    expect(screen.queryByText('Youssef Chaoui')).not.toBeInTheDocument()
    expect(screen.getByText('Clôture prévue')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByText('Clôture prévue')).not.toBeInTheDocument()
    expect(within(other).getByRole('button', { name: 'Déplier la fiche' })).toHaveFocus()
  })

  it("transmet les filtres et la période à l'API", async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Villa Souissi')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agent' }), '18')
    await user.click(screen.getByRole('button', { name: 'Tout' }))
    const calls = api.get.mock.calls.filter(([url]) => url === '/backoffice/transactions')
    expect(calls.at(-1)[1].params).toEqual({ agent_id: '18', page: 1 })
    const first = api.get.mock.calls.find(([url]) => url === '/backoffice/transactions')
    expect(first[1].params.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
