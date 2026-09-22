import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Dashboard from './Dashboard'

const iso = (days) => new Date(Date.now() + days * 864e5).toISOString()

const PAYLOAD = {
  widgets: {
    new_leads: [
      { id: 1, name: 'Mehdi Belhaj', source: 'contact_form', created_at: iso(-61), property_title: 'Appartement Fès' },
      { id: 2, name: 'Hind Senhaji', source: 'phone_reveal', created_at: iso(-33), property_title: 'F4 Rabat' },
      { id: 3, name: 'Hind Senhaji', source: 'website', created_at: iso(-9), property_title: 'Villa Rabat' },
    ],
    leads_weekly: [{ week: '2026-07-20', by_source: { website: 2 }, by_status: { new: 1, converted: 1 } }],
    upcoming_visits: [{ id: 9, scheduled_at: iso(1), status: 'scheduled', contact_name: 'Khadija Fassi', property_title: 'Villa Agadir' }],
    recent_visit_outcomes: { days: 15, completed: 2, cancelled: 1, no_show: 1, total: 4 },
    pipeline: { sale: [{ stage: 'final_act', count: 2, amount: 10000000, weighted: 9900000 }], rent: [] },
    closed: [],
    listings: { by_status: { active: 2 }, active: [{ id: 5, title: 'Loft Bir Rami', city: 'Kénitra', transaction_type: 'sale', price: 7030000, views: 335, contacts: 0 }] },
  },
}

vi.mock('../../services/api', () => ({ default: { get: vi.fn(async () => ({ data: PAYLOAD })) } }))

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>)
}

describe('Tableau de bord du back-office', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('fr')
  })

  it('affiche le titre en FR puis en AR', async () => {
    const { unmount } = renderDashboard()
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument()
    unmount()
    await i18n.changeLanguage('ar')
    renderDashboard()
    expect(await screen.findByRole('heading', { level: 1, name: 'لوحة القيادة' })).toBeInTheDocument()
  })

  it('montre ce qui demande une action : ancienneté des leads et contact en doublon', async () => {
    renderDashboard()
    const leads = (await screen.findByRole('heading', { name: 'Leads à traiter' })).closest('section')
    expect(within(leads).getByText('61 j')).toBeInTheDocument()
    // Hind a écrit deux fois : elle n'apparaît qu'une fois, avec le décompte de ses demandes.
    expect(within(leads).getAllByText('Hind Senhaji')).toHaveLength(1)
  })

  it('ouvre le pipeline au premier passage, un seul détail à la fois, et Échap referme', async () => {
    renderDashboard()
    // Chaque carte est elle-même une région nommée : le détail se repère par son identifiant.
    const detail = () => document.getElementById('dashboard-detail')
    await vi.waitFor(() => expect(detail()).not.toBeNull())
    expect(within(detail()).getByRole('heading', { level: 2 })).toHaveTextContent('Pipeline commercial')

    const leads = screen.getByRole('heading', { name: 'Leads à traiter' }).closest('section')
    await userEvent.click(within(leads).getByRole('button', { name: 'Développer' }))
    await vi.waitFor(() => expect(within(detail()).getByRole('heading', { level: 2 })).toHaveTextContent('Leads à traiter'))
    expect(document.querySelectorAll('#dashboard-detail')).toHaveLength(1)
    expect(within(leads).getByRole('button', { name: 'Réduire' })).toHaveAttribute('aria-expanded', 'true')

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(detail()).toBeNull(), { timeout: 1000 })
    expect(localStorage.getItem('dash-open')).toBe('')
  })
})
