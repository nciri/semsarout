import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import SettlementEditor from './SettlementEditor'

const svc = vi.hoisted(() => ({
  getSettlement: vi.fn(), compareInventories: vi.fn(), listSuggestions: vi.fn(), acceptSuggestion: vi.fn(),
  deleteDeductionLine: vi.fn(), finalizeSettlement: vi.fn(),
}))
vi.mock('../../../services/rentalService', () => ({ rentalService: svc }))
vi.mock('../../../components/backoffice/SignaturePanel', () => ({ default: () => null }))

const draft = { id: 3, status: 'draft', lines: [], deposit_amount: 3000, total_deductions: 0, refunded_amount: 3000, balance_due: 0 }

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/backoffice/gestion-locative/decompte/9']}>
        <Routes><Route path="/backoffice/gestion-locative/decompte/:leaseId" element={<SettlementEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SettlementEditor — retenues suggérées', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset())
    svc.getSettlement.mockResolvedValue(draft)
    svc.compareInventories.mockResolvedValue(null)
    svc.acceptSuggestion.mockResolvedValue({})
  })

  it('propose les interventions du bail et n’en pose une qu’à l’acceptation', async () => {
    svc.listSuggestions.mockResolvedValue({ suggestions: [
      { work_order_id: 4, label: 'Vitre salon', amount: 600, completed_at: '2026-10-02T00:00:00' }] })
    renderEditor()
    expect(await screen.findByText('Vitre salon')).toBeInTheDocument()
    expect(screen.getByText(/Rien n’est retenu tant que vous ne cliquez pas/)).toBeInTheDocument()
    expect(svc.acceptSuggestion).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Retenir Vitre salon' }))
    await vi.waitFor(() => expect(svc.acceptSuggestion).toHaveBeenCalledWith(3, 4))
  })

  it('ne propose rien sur un décompte finalisé', async () => {
    svc.getSettlement.mockResolvedValue({ ...draft, status: 'finalized' })
    svc.listSuggestions.mockResolvedValue({ suggestions: [
      { work_order_id: 4, label: 'Vitre salon', amount: 600, completed_at: '2026-10-02T00:00:00' }] })
    renderEditor()
    expect(await screen.findByText('Décompte finalisé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Retenir/ })).not.toBeInTheDocument()
    expect(svc.listSuggestions).not.toHaveBeenCalled()
  })

  it('un service injoignable ne se lit pas comme « rien à retenir » et bloque la finalisation', async () => {
    svc.listSuggestions.mockRejectedValue({ response: { status: 503 } })
    renderEditor()
    expect(await screen.findByRole('alert')).toHaveTextContent(/n’ont pas pu être chargées/)
    expect(screen.queryByText('Aucune intervention à retenir.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Finaliser/ })).toBeDisabled()
    svc.listSuggestions.mockResolvedValue({ suggestions: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Aucune intervention à retenir.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Finaliser/ })).toBeEnabled()
  })
})
