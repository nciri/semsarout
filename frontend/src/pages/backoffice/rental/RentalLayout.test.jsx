import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import RentalLayout from './RentalLayout'

const { summary } = vi.hoisted(() => ({ summary: vi.fn() }))
vi.mock('../../../services/rentalService', () => ({ rentalService: { summary } }))

const SUMMARY = {
  year: 2026, month_number: 7,
  month: { expected: 12000, collected: 8000, count: 2 },
  arrears: {
    total: 9000, periods: 2, leases: 2, buckets: { lt15: 0, d15_45: 4000, gt45: 5000 },
    items: [
      { period_id: 2, lease_id: 20, lease_reference: 'BAIL-2', tenant_name: 'Karim Lahlou', property_title: 'Villa Hay Riad', property_city: 'Rabat', year: 2026, month: 5, rest: 5000, paid_amount: null, age_days: 87, reminder_count: 3 },
      { period_id: 1, lease_id: 10, lease_reference: 'BAIL-1', tenant_name: 'Amine Tazi', property_title: 'Appartement Gauthier', property_city: 'Casablanca', year: 2026, month: 7, rest: 4000, paid_amount: 3000, age_days: 22, reminder_count: 1 },
    ],
  },
  occupancy: { managed: 3, leased: 2 },
  fees: { month: 740 },
  collections: { months: [{ year: 2026, month: 7, key: '2026-07', expected: 12000, collected: 8000, count: 2 }], by_lease: [] },
  expiring: { days: 90, items: [], undated: { leases: 1, mandates: 2 } },
  applications: { pending: [], recent_decisions: [], total: 0 },
  inventories: { items: [], active_leases: 2, entry_signed: 2, deposits_exposed: 0 },
  vacant: [],
  counts: { mandates: 4, leases: 2, active_leases: 2 },
}

function renderLayout() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/backoffice/gestion-locative/baux']}>
        <Routes>
          <Route path="/backoffice/gestion-locative" element={<RentalLayout />}>
            <Route path="baux" element={<p>registre des baux</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RentalLayout', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    try { localStorage.clear() } catch { /* stockage indisponible */ }
    summary.mockReset()
    summary.mockResolvedValue(SUMMARY)
  })

  it('affiche le titre FR', async () => {
    renderLayout()
    expect(await screen.findByText('Gestion locative')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderLayout()
    expect(await screen.findByText('التسيير الكرائي')).toBeInTheDocument()
  })

  it('résume le mois : encaissé sur attendu, impayés, occupation, honoraires', async () => {
    renderLayout()
    expect(await screen.findByText(/Encaissé en juillet/)).toBeInTheDocument()
    expect(screen.getByText(/sur 12\s000 Dh attendus · 67 %/)).toBeInTheDocument()
    expect(screen.getByText('2 échéances sur 2 baux')).toBeInTheDocument()
    expect(screen.getByText('2 biens loués sur 3 sous mandat actif')).toBeInTheDocument()
    expect(screen.getByText('registre des baux')).toBeInTheDocument()
  })

  it('déplie un seul détail à la fois, et Échap le replie', async () => {
    renderLayout()
    const card = (await screen.findByRole('heading', { name: 'Loyers en retard' })).closest('section')
    await userEvent.click(within(card).getByRole('button', { name: 'Développer' }))
    const region = await vi.waitFor(() => { const el = document.getElementById('rental-detail'); if (!el) throw new Error('fermé'); return el })
    expect(within(region).getByText('Karim Lahlou')).toBeInTheDocument()
    expect(within(region).getAllByRole('button', { name: 'Enregistrer un paiement' })).toHaveLength(2)

    const cash = screen.getByRole('heading', { name: "Loyers encaissés, par mois d'échéance" }).closest('section')
    await userEvent.click(within(cash).getByRole('button', { name: 'Développer' }))
    expect(await screen.findByRole('heading', { name: 'Loyers encaissés' })).toBeInTheDocument()
    expect(screen.queryByText('Karim Lahlou', { selector: 'td b' })).not.toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.getElementById('rental-detail')).toBeNull())
  })
})
