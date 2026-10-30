import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Subscription from './Subscription'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../services/api', () => ({ default: { get, post, delete: vi.fn() } }))
vi.mock('../../store/authStore', () => ({
  default: () => ({ user: { id: 1, agency_id: 4, account_type: 'agency', first_name: 'Younes' } }),
}))

const SUB = {
  current_plan: 'pro',
  subscription: {
    id: 1, status: 'active', amount: 499, billing_cycle: 'monthly',
    end_date: '2026-11-30T00:00:00', cancelled_at: null, pending_change: null,
    plan: { id: 2, slug: 'pro', name: 'Pro' },
  },
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Subscription /></MemoryRouter>
    </QueryClientProvider>,
  )
}

function mockApi(subscription) {
  get.mockImplementation((url) => {
    if (url === '/subscription/current') return Promise.resolve({ data: subscription })
    if (url === '/payment-methods') return Promise.resolve({ data: { payment_methods: [] } })
    if (url === '/invoices') return Promise.resolve({ data: { invoices: [] } })
    return Promise.resolve({ data: {} })
  })
}

describe('Portail d’abonnement', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    get.mockReset()
    post.mockReset()
    post.mockResolvedValue({ data: {} })
  })

  it('propose de reprendre un abonnement résilié', async () => {
    mockApi({ ...SUB, subscription: { ...SUB.subscription, cancelled_at: '2026-11-02T10:00:00' } })
    renderPage()
    expect(await screen.findByText(/abonnement est résilié/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: "Reprendre l'abonnement" }))
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/subscription/reactivate', null))
  })

  it('annonce un changement de plan programmé et permet de l’annuler', async () => {
    mockApi({
      ...SUB,
      subscription: {
        ...SUB.subscription,
        pending_change: { plan_slug: 'starter', plan_name: 'Starter', amount: 199, effective_at: '2026-11-30T00:00:00' },
      },
    })
    renderPage()
    expect(await screen.findByText(/Passage au plan Starter programmé/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le changement' }))
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/subscription/plan-change/cancel', null))
  })

  it("n'affiche aucun bandeau quand rien n'est programmé", async () => {
    mockApi(SUB)
    renderPage()
    await screen.findByText('Mon abonnement')
    expect(screen.queryByText(/programmé/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Reprendre l'abonnement" })).not.toBeInTheDocument()
  })
})
