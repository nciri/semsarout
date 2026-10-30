import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import ConfirmProvider from '../../../components/common/ConfirmProvider'
import ExpensesList from './ExpensesList'

const { svc } = vi.hoisted(() => ({ svc: { listPendingWorkOrders: vi.fn(), settleWorkOrder: vi.fn() } }))
vi.mock('../../../services/artisanService', () => ({ artisanService: svc }))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ConfirmProvider>
        <MemoryRouter><ExpensesList /></MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>,
  )
}

describe('ExpensesList', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    svc.listPendingWorkOrders.mockReset()
    svc.settleWorkOrder.mockReset()
    svc.settleWorkOrder.mockResolvedValue({})
  })

  it('alerte sur une dépense qui dort depuis plus de 60 jours', async () => {
    svc.listPendingWorkOrders.mockResolvedValue({ work_orders: [
      { id: 4, title: 'Peinture', cost_final: 8000, waiting_days: 91, charge_mode: 'crg_expense' },
      { id: 5, title: 'Vitre', cost_final: 600, waiting_days: 3, charge_mode: 'to_rebill' }] })
    renderPage()
    expect(await screen.findByText('Peinture')).toBeInTheDocument()
    expect(screen.getByText('91 j')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('1')
  })

  it("n'alerte pas quand aucune dépense ne dort", async () => {
    svc.listPendingWorkOrders.mockResolvedValue({ work_orders: [
      { id: 5, title: 'Vitre', cost_final: 600, waiting_days: 60, charge_mode: 'to_rebill' }] })
    renderPage()
    expect(await screen.findByText('Vitre')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('solde une refacturation après confirmation, montant et mode dans la question', async () => {
    svc.listPendingWorkOrders.mockResolvedValue({ work_orders: [
      { id: 5, title: 'Vitre', cost_final: 600, waiting_days: 3, charge_mode: 'to_rebill', can_settle_writeoff: true }] })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Solder Vitre' }))
    expect(svc.settleWorkOrder).not.toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByLabelText('Comment'), 'encaisse')
    expect(svc.settleWorkOrder).not.toHaveBeenCalled()
    expect(screen.getByText(/600 Dh.*Encaissé/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await vi.waitFor(() => expect(svc.settleWorkOrder).toHaveBeenCalledWith(5, { method: 'encaisse' }))
  })

  it("n'offre l'abandon et l'imputation qu'à qui le serveur l'autorise", async () => {
    svc.listPendingWorkOrders.mockResolvedValue({ work_orders: [
      { id: 5, title: 'Vitre', cost_final: 600, waiting_days: 3, charge_mode: 'to_rebill', can_settle_writeoff: false },
      { id: 7, title: 'Porte', cost_final: 900, waiting_days: 3, charge_mode: 'to_rebill', can_settle_writeoff: true }] })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Solder Vitre' }))
    expect(screen.getByLabelText('Comment')).toHaveTextContent('Régularisé')
    expect(screen.getByLabelText('Comment')).not.toHaveTextContent('Abandonné')
    expect(screen.getByLabelText('Comment')).not.toHaveTextContent('Imputé sur la commission')
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    await userEvent.click(screen.getByRole('button', { name: 'Solder Porte' }))
    expect(screen.getByLabelText('Comment')).toHaveTextContent('Abandonné')
    expect(screen.getByLabelText('Comment')).toHaveTextContent('Imputé sur la commission')
  })

  it("signale une intervention achevée dont personne n'a choisi le règlement", async () => {
    svc.listPendingWorkOrders.mockResolvedValue({ work_orders: [
      { id: 6, title: 'Serrure', cost_final: 120, waiting_days: 2, charge_mode: null }] })
    renderPage()
    expect(await screen.findByText('Règlement à choisir')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Solder/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choisir le règlement de Serrure' })).toHaveAttribute('href', '/backoffice/tiers/interventions/6')
  })
})
