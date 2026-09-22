import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import ClientDetail from './ClientDetail'

const CLIENT = { id: 15, first_name: 'Omar', last_name: 'Belhaj', client_type: 'tenant', status: 'active', city: 'Rabat',
  email: 'client15@email.com', phone: '+212 628800129', assigned_to_id: 18, assigned_to_name: 'Ahmed Tazi', tags: [] }
const HISTORY = {
  events: [{ kind: 'visit', id: 5, date: '2026-07-12T18:30:00', scheduled_at: '2026-07-12T18:30:00', status: 'completed',
    client_feedback: 'very_interested', property_id: 106, property_title: 'Loft Bir Rami', agent_name: 'Fatima Bennani' }],
  duplicates: [{ id: 30, name: 'Omar Belhaj', city: 'Fès', client_type: 'buyer', status: 'prospect', reasons: ['name'] }],
  last_exchange_at: '2026-07-12T18:30:00',
}

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), delete: vi.fn() } }))

describe('Fiche complète d\'un client', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    api.get.mockImplementation(async (url) => ({
      data: url.includes('/history') ? HISTORY : url.includes('/summary') ? { clients: [], duplicates: [] }
        : url.includes('/transactions') ? { transactions: [] } : CLIENT,
    }))
  })

  it('montre les coordonnées en entier, la frise et le doublon signalé par le crm', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/backoffice/clients/15']}>
          <Routes><Route path="/backoffice/clients/:id" element={<ClientDetail />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: /Omar Belhaj/ })).toBeInTheDocument()
    expect(screen.getByText('client15@email.com')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Frise des leads/ })).toBeInTheDocument()
    expect(screen.getByText('Visite · Loft Bir Rami')).toBeInTheDocument()
    expect(screen.getByText(/avec la fiche Omar Belhaj/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nouvelle location' })).toHaveAttribute('href', '/backoffice/transactions/nouveau?client_id=15&type=rent')
  })
})
