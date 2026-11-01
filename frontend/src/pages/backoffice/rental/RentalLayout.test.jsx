import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import RentalLayout from './RentalLayout'

const { summary, listCrgDrafts } = vi.hoisted(() => ({ summary: vi.fn(), listCrgDrafts: vi.fn() }))
vi.mock('../../../services/rentalService', () => ({ rentalService: { summary, listCrgDrafts } }))

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
    listCrgDrafts.mockReset()
    listCrgDrafts.mockResolvedValue({ drafts: [] })
  })

  it('signale en rouge les comptes rendus jamais validés, avec leur âge', async () => {
    listCrgDrafts.mockResolvedValue({ drafts: [
      { crg_id: 12, mandate_id: 3, mandate_reference: 'MND-3', period_label: 'Septembre 2026', net: 4020, waiting_days: 40 },
      { crg_id: 14, mandate_id: 5, mandate_reference: 'MND-5', period_label: 'Octobre 2026', net: 900, waiting_days: 2 },
    ] })
    renderLayout()
    expect(await screen.findByText('Comptes rendus de gérance en attente : 2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'MND-3 · Septembre 2026' })).toHaveAttribute('href', '/backoffice/gestion-locative/mandats/3')
    expect(screen.getByText('40 j')).toBeInTheDocument()
    expect(screen.getByText('2 j')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /^MND-\d · / }).map((a) => a.textContent)
    expect(links).toEqual(['MND-3 · Septembre 2026', 'MND-5 · Octobre 2026'])
  })

  it('signale aussi un compte rendu validé jamais parti, marqué comme bloqué à l’envoi', async () => {
    listCrgDrafts.mockResolvedValue({ drafts: [
      { crg_id: 12, mandate_id: 3, mandate_reference: 'MND-3', period_label: 'Septembre 2026', net: 4020, waiting_days: 40, status: 'validated' },
      { crg_id: 14, mandate_id: 5, mandate_reference: 'MND-5', period_label: 'Octobre 2026', net: 900, waiting_days: 2, status: 'draft' },
    ] })
    renderLayout()
    const bloque = await screen.findByRole('link', { name: 'MND-3 · Septembre 2026' })
    // La puce n'est portée que par le relevé validé : un brouillon ne doit pas s'annoncer bloqué.
    expect(within(bloque.closest('li')).getByText('validé, envoi en attente')).toBeInTheDocument()
    const brouillon = screen.getByRole('link', { name: 'MND-5 · Octobre 2026' })
    expect(within(brouillon.closest('li')).queryByText('validé, envoi en attente')).not.toBeInTheDocument()
  })

  it('garde le bandeau visible quand la synthèse est en erreur', async () => {
    summary.mockRejectedValue(new Error('boom'))
    listCrgDrafts.mockResolvedValue({ drafts: [{ crg_id: 12, mandate_id: 3, mandate_reference: 'MND-3', period_label: 'Septembre 2026', net: 4020, waiting_days: 40 }] })
    renderLayout()
    expect(await screen.findByText('Comptes rendus de gérance en attente : 1')).toBeInTheDocument()
  })

  it('n’affiche aucun bandeau quand rien n’attend de validation', async () => {
    renderLayout()
    expect(await screen.findByText('Gestion locative')).toBeInTheDocument()
    expect(screen.queryByText(/Comptes rendus de gérance en attente/)).not.toBeInTheDocument()
  })

  it('affiche le titre FR', async () => {
    renderLayout()
    expect(await screen.findByText('Gestion locative')).toBeInTheDocument()
  })

  it('mène à la fiche d’une candidature sans réponse', async () => {
    summary.mockResolvedValue({
      ...SUMMARY,
      applications: {
        pending: [{ id: 7, applicant_name: 'Salma Bennis', property_title: 'Appartement Gauthier', property_id: 3, status: 'pending', age_days: 5 }],
        recent_decisions: [], total: 1,
      },
    })
    renderLayout()
    expect(await screen.findByRole('link', { name: 'Salma Bennis' }))
      .toHaveAttribute('href', '/backoffice/gestion-locative/candidatures/7')
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
