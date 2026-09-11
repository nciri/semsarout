import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import useAuthStore from '../../store/authStore'
import api from '../../services/api'
import PrivateRoute from './PrivateRoute'

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }))

function renderAt(path, status) {
  api.get.mockResolvedValue({ data: { subscription: { status } } })
  useAuthStore.setState({ isAuthenticated: true, user: { id: 1, user_type: 'professional' } })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PrivateRoute />}>
            <Route path="/dashboard/annonces" element={<p>annonces</p>} />
            <Route path="/dashboard/compte/abonnement" element={<p>abonnement</p>} />
            <Route path="/checkout" element={<p>paiement</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PrivateRoute — accès réduit', () => {
  beforeEach(() => api.get.mockReset())

  it("ramène une agence en accès réduit vers sa page d'abonnement", async () => {
    renderAt('/dashboard/annonces', 'restricted')
    expect(await screen.findByText('abonnement')).toBeInTheDocument()
  })

  it('la laisse payer', async () => {
    renderAt('/checkout', 'restricted')
    expect(await screen.findByText('paiement')).toBeInTheDocument()
  })

  it('laisse passer un abonnement actif', async () => {
    renderAt('/dashboard/annonces', 'active')
    expect(await screen.findByText('annonces')).toBeInTheDocument()
  })
})
