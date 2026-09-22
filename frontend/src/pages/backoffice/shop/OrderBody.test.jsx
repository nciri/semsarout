import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import OrderBody from './OrderBody'

const base = {
  id: 11, reference: 'CMD-4BAE62', status: 'pending', total: 500, delivery_address: 'Rue Y, Casablanca',
  created_at: '2026-07-24T00:36:30', payment_reference: null,
}

function renderBody(order) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><OrderBody order={order} now={new Date('2026-07-27T10:00:00')} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OrderBody', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("ne propose pas de payer une commande dont l'article a quitté le catalogue", () => {
    renderBody({ ...base, items: [{ id: 9, product_id: null, product_name: 'Four à supprimer', unit_price: 500, quantity: 1, line_total: 500, available: false, current_price: null }] })
    expect(screen.getByText('Retiré du catalogue')).toBeInTheDocument()
    expect(screen.getByText(/Aucun stock ne peut être réservé/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Payer/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler la commande' })).toBeInTheDocument()
    expect(screen.getByText('En attente de paiement depuis 3 jours')).toBeInTheDocument()
  })

  it("montre l'écart avec le prix actuel et propose le paiement", () => {
    renderBody({ ...base, total: 9600, items: [{ id: 8, product_id: 4, product_name: 'Armoire 3 portes', unit_price: 3200, quantity: 3, line_total: 9600, available: true, current_price: 4199 }] })
    expect(screen.getByText(/aujourd'hui 4\s199 Dh \(\+31\s%\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Payer 9\s600 Dh/ })).toBeInTheDocument()
  })

  it('bascule en arabe', async () => {
    await i18n.changeLanguage('ar')
    renderBody({ ...base, status: 'paid', payment_reference: 'PAY-1', paid_at: '2026-07-24T00:36:30', items: [] })
    expect(screen.getByText('تم الدفع')).toBeInTheDocument()
  })
})
