import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import LeasePanel from './LeasePanel'

const rental = vi.hoisted(() => ({ listRentPeriods: vi.fn(), listInventories: vi.fn() }))
const artisan = vi.hoisted(() => ({ listWorkOrders: vi.fn() }))
vi.mock('../../../services/rentalService', () => ({ rentalService: rental }))
vi.mock('../../../services/artisanService', () => ({ artisanService: artisan }))

const lease = { id: 9, status: 'active', rent_amount: 3000, charges_amount: 0, deposit_amount: 6000, payment_day: 1 }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><LeasePanel lease={lease} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LeasePanel — interventions', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    rental.listRentPeriods.mockResolvedValue({ rent_periods: [] })
    rental.listInventories.mockResolvedValue({ inventories: [] })
  })

  it('montre le total déjà retenu sur la caution, sans compter ce qui ne l’est pas', async () => {
    artisan.listWorkOrders.mockResolvedValue({ work_orders: [
      { id: 4, title: 'Vitre salon', cost_final: 600, payer: 'tenant', charge_mode: 'deposit_deduction', charged_ref: 'settlement:3' },
      { id: 5, title: 'Serrure', cost_final: 300, payer: 'tenant', charge_mode: 'to_rebill', charged_ref: null },
      { id: 6, title: 'Volet', cost_final: 150, payer: 'tenant', charge_mode: 'deposit_deduction', charged_ref: null }] })
    renderPanel()
    expect(await screen.findByText('Vitre salon')).toBeInTheDocument()
    expect(artisan.listWorkOrders).toHaveBeenCalledWith({ lease_id: 9 })
    expect(screen.getByText('Déjà retenu sur la caution : 600 Dh')).toBeInTheDocument()
    expect(screen.getAllByText('Payeur : Locataire · Retenu sur la caution')).toHaveLength(2)
  })

  it('ne confond pas une liste en échec avec un bail sans intervention', async () => {
    artisan.listWorkOrders.mockRejectedValue({ response: { status: 503 } })
    renderPanel()
    expect(await screen.findByText(/Interventions indisponibles/)).toBeInTheDocument()
    expect(screen.queryByText('Aucune intervention sur ce bail.')).not.toBeInTheDocument()
  })
})
