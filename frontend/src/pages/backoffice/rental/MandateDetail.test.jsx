import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import MandateDetail from './MandateDetail'

const svc = vi.hoisted(() => ({ getMandate: vi.fn(), listCrg: vi.fn(), validateCrg: vi.fn() }))
vi.mock('../../../services/rentalService', () => ({ rentalService: svc }))
vi.mock('../../../components/backoffice/SignaturePanel', () => ({ default: () => null }))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/backoffice/gestion-locative/mandats/3']}>
        <Routes><Route path="/backoffice/gestion-locative/mandats/:id" element={<MandateDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MandateDetail — compte rendu de gérance', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset())
    svc.getMandate.mockResolvedValue({ id: 3, reference: 'MND-3', status: 'active', mandate_type: 'gestion', property_id: 7, landlord_client_id: 1 })
    svc.validateCrg.mockResolvedValue({})
  })

  it('montre les dépenses du brouillon et permet d’en écarter une', async () => {
    svc.listCrg.mockResolvedValue({ reports: [{ id: 12, period_label: 'Septembre 2026',
      status: 'draft', rent_collected: 6000, fees: 480, expenses: 1500, net: 4020,
      created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
      expense_lines: [{ id: 4, title: 'Chauffe-eau', cost_final: 1200 },
                      { id: 5, title: 'Serrure', cost_final: 300 }] }] })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Écarter Serrure' }))
    expect(screen.getByText(/Net après écarts : 4\s320 Dh/)).toBeInTheDocument()
    expect(screen.getByText('40 j')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Valider le compte rendu' }))
    await vi.waitFor(() => expect(svc.validateCrg).toHaveBeenCalledWith(12,
      { excluded_work_order_ids: [5] }))
  })

  it('un compte rendu envoyé ne se valide plus', async () => {
    svc.listCrg.mockResolvedValue({ reports: [{ id: 11, period_label: 'Août 2026',
      status: 'sent', rent_collected: 6000, fees: 480, expenses: 0, net: 5520 }] })
    renderPage()
    expect(await screen.findByText('Août 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider le compte rendu' })).not.toBeInTheDocument()
  })

  it('un compte rendu validé ne se valide plus non plus', async () => {
    svc.listCrg.mockResolvedValue({ reports: [{ id: 13, period_label: 'Juillet 2026',
      status: 'validated', rent_collected: 6000, fees: 480, expenses: 0, net: 5520 }] })
    renderPage()
    expect(await screen.findByText('Juillet 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider le compte rendu' })).not.toBeInTheDocument()
  })
})
