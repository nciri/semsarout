import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import Dashboard from './Dashboard'

const iso = (days) => new Date(Date.now() + days * 864e5).toISOString()

const PAYLOAD = {
  widgets: {
    new_leads: [
      { id: 1, name: 'Mehdi Belhaj', source: 'contact_form', created_at: iso(-61), property_title: 'Appartement Fès', transaction_type: 'sale' },
      { id: 2, name: 'Hind Senhaji', source: 'phone_reveal', created_at: iso(-33), property_title: 'F4 Rabat', transaction_type: 'rent' },
      { id: 3, name: 'Hind Senhaji', source: 'website', created_at: iso(-9), property_title: 'Villa Rabat', transaction_type: 'rent' },
    ],
    leads_weekly: [{ week: '2026-07-20', by_source: { website: 2 }, by_status: { new: 1, converted: 1 } }],
    upcoming_visits: [{ id: 9, scheduled_at: iso(1), status: 'scheduled', contact_name: 'Khadija Fassi', property_title: 'Villa Agadir', transaction_type: 'sale' }],
    recent_visit_outcomes: {
      days: 15, completed: 2, cancelled: 1, no_show: 1, total: 4,
      sale: { days: 15, completed: 2, cancelled: 0, no_show: 0, total: 2 },
      rent: { days: 15, completed: 0, cancelled: 1, no_show: 1, total: 2 },
    },
    pipeline: { sale: [{ stage: 'final_act', count: 2, amount: 10000000, weighted: 9900000 }], rent: [] },
    closed: [],
    listings: {
      by_status: { active: 2 },
      by_status_by_type: { sale: { active: 1 }, rent: { active: 1 } },
      active: [{ id: 5, title: 'Loft Bir Rami', city: 'Kénitra', transaction_type: 'sale', price: 7030000, views: 335, contacts: 0 }],
    },
  },
}

const RENTAL = {
  arrears: { total: 14000, periods: 2, leases: 2, items: [] },
  expiring: { days: 60, items: [{ kind: 'lease', id: 3, reference: 'BAIL-1', property_title: 'F3 Agdal', end_date: iso(20) }] },
  applications: { pending: [{ id: 4, applicant_name: 'Salma Bennani', age_days: 6 }] },
  inventories: { items: [{ lease_id: 3, entry_signed: false }], active_leases: 4, deposits_exposed: 8000 },
  month: { expected: 40000, collected: 26000, count: 4 },
}

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }))

function renderDashboard({ pipeline, rental = RENTAL } = {}) {
  api.get.mockImplementation(async (url) => {
    if (url.includes('/gestion-locative/summary')) {
      if (!rental) throw Object.assign(new Error('403'), { response: { status: 403 } })
      return { data: rental }
    }
    return { data: pipeline ? { ...PAYLOAD, widgets: { ...PAYLOAD.widgets, pipeline } } : PAYLOAD }
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>)
}

describe('Tableau de bord du back-office', () => {
  beforeEach(async () => {
    api.get.mockReset()
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

describe('Tableau de bord : une activité à la fois', () => {
  beforeEach(async () => {
    api.get.mockReset()
    localStorage.clear()
    await i18n.changeLanguage('fr')
  })

  it('filtre toute la page sur la location, et montre alors la gestion locative', async () => {
    renderDashboard()
    const leads = () => screen.getByRole('heading', { name: 'Leads à traiter' }).closest('section')
    expect(await screen.findByText('Mehdi Belhaj')).toBeInTheDocument()   // lead de vente

    await userEvent.click(screen.getByRole('button', { name: 'Location' }))

    expect(within(leads()).queryByText('Mehdi Belhaj')).not.toBeInTheDocument()
    expect(within(leads()).getByText('Hind Senhaji')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gestion locative' })).toBeInTheDocument()
    expect(localStorage.getItem('dash-activity')).toBe('rent')
  })

  it('cache la gestion locative quand on ne regarde que la vente', async () => {
    renderDashboard()
    await screen.findByText('Mehdi Belhaj')
    await userEvent.click(screen.getByRole('button', { name: 'Vente' }))
    expect(screen.queryByRole('heading', { name: 'Gestion locative' })).not.toBeInTheDocument()
  })

  it('ouvre sur la location quand le portefeuille de dossiers l’est en majorité', async () => {
    renderDashboard({ pipeline: { sale: [{ stage: 'offer', count: 1, amount: 10, weighted: 5 }],
                                  rent: [{ stage: 'application', count: 9, amount: 90, weighted: 45 }] } })
    await screen.findByText('Hind Senhaji')
    expect(await screen.findByRole('button', { name: 'Location' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('n’affiche pas le widget locatif à une agence sans la gestion locative', async () => {
    renderDashboard({ rental: null })
    await screen.findByText('Mehdi Belhaj')
    expect(screen.queryByRole('heading', { name: 'Gestion locative' })).not.toBeInTheDocument()
  })
})
