import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import TransactionDetail from './TransactionDetail'

const TX = {
  id: 8, reference: 'TX-202607-0008', property_id: 4, property_title: 'Appartement Médina', client_id: 3, client_name: 'Ahmed Alaoui',
  transaction_type: 'sale', stage: 'offer', status: 'lost', lost_reason: 'Prix trop élevé', priority: 'medium',
  asking_price: 1880000, offer_price: 1779047.27, commission_rate: 2.5, expected_commission: 44476.18, probability: 55,
  contact_date: '2026-07-24T00:30:00', closed_at: '2026-06-25T00:00:00',
  offers: [{ id: 1, amount: 1779047.27, from_party: 'buyer', status: 'rejected', created_at: '2026-06-20T10:00:00' }],
}

vi.mock('../../services/api', () => ({ default: { get: vi.fn(async () => ({ data: TX })) } }))

describe('Fiche transaction', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche la référence, le motif de perte et les offres', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/backoffice/transactions/8']}>
          <Routes><Route path="/backoffice/transactions/:id" element={<TransactionDetail />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'TX-202607-0008' })).toBeInTheDocument()
    expect(screen.getByText('Motif : Prix trop élevé')).toBeInTheDocument()
    expect(screen.getByText('Offres (1)')).toBeInTheDocument()
    expect(screen.getByText('Refusée')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à la liste' })).toHaveAttribute('href', '/backoffice/transactions')
  })
})
