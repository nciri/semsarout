import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import AdminOverview from './AdminOverview'

const { svc } = vi.hoisted(() => ({
  svc: { getOverview: vi.fn(), getNotifications: vi.fn(), runScheduler: vi.fn() },
}))
vi.mock('../../services/adminService', () => ({ adminService: svc }))

const OVERVIEW = {
  total_users: 120, total_agencies: 14, mrr_estimate: 7480, arr_estimate: 89760,
  signups_last_30d: 9, suspended_count: 1, deleted_pending_purge_count: 0,
  active_subscriptions: { starter: 8, pro: 5 },
  unpaid_subscriptions: { past_due: 2, restricted: 1 },
  payment_incidents: [
    { subscription_id: 3, agency_id: 11, plan: 'pro', status: 'past_due', amount: 499,
      grace_until: '2026-11-05T00:00:00', end_date: '2026-10-25T00:00:00', unpaid_invoices: 1,
      last_failure_at: '2026-10-26T09:00:00', last_failure_reason: 'Carte refusée' },
  ],
}
const JOURNAL = {
  failed: 1,
  notifications: [
    { id: 9, channel: 'email', recipient: 'agence@example.com', template: 'invoice_reminder', status: 'failed', created_at: '2026-10-27T08:00:00' },
    { id: 8, channel: 'email', recipient: 'voyageur@example.com', template: 'stay_message', status: 'sent', created_at: '2026-10-27T07:00:00' },
  ],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><AdminOverview /></QueryClientProvider>)
}

describe('Suivi SaaS (super-admin)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset())
    svc.getOverview.mockResolvedValue(OVERVIEW)
    svc.getNotifications.mockResolvedValue(JOURNAL)
    svc.runScheduler.mockResolvedValue({ ok: true })
  })

  it('affiche le MRR et son annualisation', async () => {
    renderPage()
    expect(await screen.findByText('ARR estimé')).toBeInTheDocument()
    expect(screen.getByText('89760')).toBeInTheDocument()
  })

  it('liste les incidents de paiement avec leur motif', async () => {
    renderPage()
    expect(await screen.findByText('Carte refusée')).toBeInTheDocument()
    expect(screen.getByText('Impayé')).toBeInTheDocument()
    expect(screen.getByText('#11')).toBeInTheDocument()
  })

  it('rejoue les tâches planifiées à la demande', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Lancer maintenant' }))
    await vi.waitFor(() => expect(svc.runScheduler).toHaveBeenCalled())
  })

  it('montre le journal des envois et compte les échecs', async () => {
    renderPage()
    expect(await screen.findByText('Derniers envois (1 en échec)')).toBeInTheDocument()
    expect(screen.getByText('stay_message')).toBeInTheDocument()
    expect(screen.getByText('Échec')).toBeInTheDocument()
  })
})
