import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import NotariesAndCases from './NotariesAndCases'

const { svc } = vi.hoisted(() => ({
  svc: {
    listNotaries: vi.fn(), createNotary: vi.fn(), updateNotary: vi.fn(), deleteNotary: vi.fn(),
    listCases: vi.fn(), createCase: vi.fn(),
  },
}))
vi.mock('../../../services/legalService', () => ({ legalService: svc }))

const NOTARIES = {
  notaries: [
    { id: 3, name: 'Me Alaoui', office: 'Étude Alaoui', city: 'Rabat', phone: '0537000000', email: 'alaoui@example.com' },
    { id: 4, name: 'Me Chraibi', office: 'Étude Chraibi', city: 'Casablanca', phone: '0522000000', email: null },
  ],
}
const CASES = {
  cases: [
    { id: 7, title: 'Vente Anfa', case_type: 'sale', notary: { name: 'Me Alaoui' }, tasks_done: 1, tasks_total: 4, status: 'open' },
    { id: 8, title: 'Bail Agdal', case_type: 'rental', notary: { name: 'Me Chraibi' }, tasks_done: 0, tasks_total: 3, status: 'open' },
  ],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><NotariesAndCases /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Notaires & dossiers', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset?.())
    svc.listNotaries.mockResolvedValue(NOTARIES)
    svc.listCases.mockResolvedValue(CASES)
  })

  it('cherche le notaire et ses dossiers du même mot', async () => {
    renderPage()
    expect(await screen.findByText('Vente Anfa')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('Rechercher un notaire ou un dossier')).toHaveLength(1)
    await userEvent.type(screen.getByPlaceholderText('Rechercher un notaire ou un dossier'), 'chraibi')
    // Le notaire reste (fiche et colonne du dossier), son dossier aussi ; les autres tombent.
    expect(screen.getAllByText('Me Chraibi').length).toBeGreaterThan(0)
    expect(screen.getByText('Bail Agdal')).toBeInTheDocument()
    expect(screen.queryByText('Vente Anfa')).not.toBeInTheDocument()
    expect(screen.queryByText('Étude Alaoui')).not.toBeInTheDocument()
  })

  it('crée un dossier dans une popup, pas dans la page', async () => {
    svc.createCase.mockResolvedValue({ case: { id: 9 } })
    renderPage()
    await screen.findByText('Vente Anfa')
    expect(screen.queryByLabelText('Type de dossier')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau dossier' }))
    await userEvent.type(screen.getByLabelText('Intitulé'), 'Vente Maarif')
    await userEvent.selectOptions(screen.getByLabelText('Type de dossier'), 'rental')
    await userEvent.click(screen.getByRole('button', { name: 'Créer le dossier' }))
    await vi.waitFor(() => expect(svc.createCase).toHaveBeenCalledWith({
      title: 'Vente Maarif', case_type: 'rental',
    }))
  })
})
