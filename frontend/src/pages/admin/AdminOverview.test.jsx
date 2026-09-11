import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import AdminOverview from './AdminOverview'
import { adminService } from '../../services/adminService'

vi.mock('../../services/adminService', () => ({ adminService: { getOverview: vi.fn() } }))

describe('AdminOverview — impayés', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('montre les abonnements en grâce et en accès réduit', async () => {
    adminService.getOverview.mockResolvedValue({
      active_subscriptions: {}, unpaid_subscriptions: { past_due: 3, restricted: 1 },
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><AdminOverview /></QueryClientProvider>)
    expect(await screen.findByText('Impayés en grâce')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Accès réduits')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
