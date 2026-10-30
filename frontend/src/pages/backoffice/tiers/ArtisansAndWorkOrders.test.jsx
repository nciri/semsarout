import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import ArtisansAndWorkOrders from './ArtisansAndWorkOrders'

const { svc } = vi.hoisted(() => ({
  svc: {
    listTrades: vi.fn(), listArtisans: vi.fn(), createArtisan: vi.fn(), updateArtisan: vi.fn(),
    deleteArtisan: vi.fn(), listWorkOrders: vi.fn(), createWorkOrder: vi.fn(),
  },
}))
vi.mock('../../../services/artisanService', () => ({ artisanService: svc }))

const TRADES = { trades: [{ id: 'plombier', label: 'Plombier' }, { id: 'electricien', label: 'Électricien' }] }
const ARTISANS = {
  artisans: [{ id: 1, name: 'Hassan Benali', company: 'Benali Plomberie', city: 'Casablanca', phone: '0600000000', trade: 'plombier', is_shared: false }],
}
const ORDERS = {
  work_orders: [
    { id: 11, title: 'Fuite salle de bain', trade: 'plombier', artisan: { name: 'Hassan Benali' }, cost_final: 450, status: 'done' },
    { id: 12, title: 'Tableau électrique', trade: 'electricien', artisan: null, cost_final: null, status: 'scheduled' },
    { id: 13, title: 'Chauffe-eau', trade: 'plombier', artisan: null, cost_final: null, status: 'in_progress' },
  ],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ArtisansAndWorkOrders /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Artisans & interventions', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset?.())
    svc.listTrades.mockResolvedValue(TRADES)
    svc.listArtisans.mockResolvedValue(ARTISANS)
    svc.listWorkOrders.mockResolvedValue(ORDERS)
  })

  it("ne garde qu'un seul filtre pour les deux sections", async () => {
    renderPage()
    // Le nom figure dans l'annuaire et dans la colonne « Artisan » des interventions.
    expect((await screen.findAllByText('Hassan Benali')).length).toBeGreaterThan(0)
    expect(screen.getAllByPlaceholderText('Rechercher un artisan ou une intervention')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Annuaire' })).toBeInTheDocument()
    // Les compteurs chiffrés de l'annuaire ont disparu ; « Mon agence » ne subsiste que
    // comme étiquette de ligne, pas comme KPI.
    expect(screen.queryByText('Partagés')).not.toBeInTheDocument()
  })

  it("montre l'avancement des interventions au lieu de quatre nombres", async () => {
    renderPage()
    expect(await screen.findByText('interventions au total')).toBeInTheDocument()
    const legend = screen.getByRole('list')
    expect(within(legend).getByText('Planifié')).toBeInTheDocument()
    expect(within(legend).getByText('Annulé')).toBeInTheDocument()
  })

  it('applique la recherche aux deux sections', async () => {
    renderPage()
    await screen.findAllByText('Hassan Benali')
    await userEvent.type(screen.getByPlaceholderText('Rechercher un artisan ou une intervention'), 'chauffe')
    await vi.waitFor(() => expect(svc.listArtisans).toHaveBeenCalledWith({ trade: '', city: '', q: 'chauffe' }))
    expect(screen.getByText('Chauffe-eau')).toBeInTheDocument()
    expect(screen.queryByText('Tableau électrique')).not.toBeInTheDocument()
  })

  it('filtre les interventions par métier', async () => {
    renderPage()
    await screen.findByText('Fuite salle de bain')
    await userEvent.selectOptions(screen.getByDisplayValue('Tous les métiers'), 'electricien')
    expect(screen.getByText('Tableau électrique')).toBeInTheDocument()
    expect(screen.queryByText('Chauffe-eau')).not.toBeInTheDocument()
  })
})
