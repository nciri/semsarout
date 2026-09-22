import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import ApplicationDetail from './ApplicationDetail'

const { getApplication, unshortlistApplication } = vi.hoisted(() => ({
  getApplication: vi.fn(),
  unshortlistApplication: vi.fn(async () => ({})),
}))

vi.mock('../../../services/rentalService', () => ({
  rentalService: {
    getApplication,
    unshortlistApplication,
    shortlistApplication: vi.fn(),
    decideApplication: vi.fn(),
    validateDocument: vi.fn(),
  },
}))

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/backoffice/gestion-locative/candidatures/7']}>
        <Routes><Route path="/backoffice/gestion-locative/candidatures/:id" element={<ApplicationDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Une présélection peut être faite par erreur, ou le candidat ne plus l'être : il faut
// pouvoir la retirer, sans quoi la seule sortie était d'accepter ou de refuser.
describe('ApplicationDetail — retrait de la présélection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    getApplication.mockReset()
    unshortlistApplication.mockClear()
  })

  it('propose le retrait sur une candidature présélectionnée, et appelle la bonne route', async () => {
    getApplication.mockResolvedValue({ id: 7, status: 'shortlist', applicant_name: 'Salma', documents: [] })
    renderDetail()
    const btn = await screen.findByRole('button', { name: /Retirer de la présélection/ })
    await userEvent.click(btn)
    expect(unshortlistApplication).toHaveBeenCalledWith('7')
  })

  it("ne le propose pas sur une candidature qui n'est pas présélectionnée", async () => {
    getApplication.mockResolvedValue({ id: 7, status: 'reviewing', applicant_name: 'Salma', documents: [] })
    renderDetail()
    expect(await screen.findByRole('button', { name: /Présélectionner/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retirer de la présélection/ })).not.toBeInTheDocument()
  })
})
