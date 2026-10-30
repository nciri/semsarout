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
    deleteWorkOrder: vi.fn(),
  },
}))
vi.mock('../../../services/artisanService', () => ({ artisanService: svc }))
// Le formulaire rattache le bon à un bien : la liste des biens vient du back-office.
// Le bien 5 est loué (bail 70) et sous mandat ; le bien 6 n'a ni l'un ni l'autre.
const API = {
  '/backoffice/properties?per_page=200': { properties: [{ id: 5, title: 'Riad Médina' }, { id: 6, title: 'Villa Anfa' }] },
  '/backoffice/clients?per_page=100': { clients: [{ id: 3, first_name: 'Samira', last_name: 'Alaoui' }] },
  '/backoffice/gestion-locative/leases': { leases: [
    { id: 70, property_id: 5, status: 'active', tenant_name: 'Karim Benali', end_date: '2027-06-30' },
    { id: 71, property_id: 6, status: 'ended', tenant_name: 'Ancien Locataire', end_date: '2024-01-31' },
  ] },
  '/backoffice/gestion-locative/mandates': { mandates: [{ id: 9, property_id: 5, status: 'active' }] },
}
vi.mock('../../../services/api', () => ({
  default: { get: vi.fn((url) => Promise.resolve({ data: API[url] })), post: vi.fn() },
}))

const TRADES = { trades: [{ id: 'plombier', label: 'Plombier' }, { id: 'electricien', label: 'Électricien' }] }
const ARTISANS = {
  artisans: [{ id: 1, name: 'Hassan Benali', company: 'Benali Plomberie', city: 'Casablanca', phone: '0600000000', trade: 'plombier', is_shared: false }],
}
// `can_delete` vient du service : il tient compte du rôle du porteur et du statut du bon.
const ORDERS = {
  work_orders: [
    { id: 11, title: 'Fuite salle de bain', trade: 'plombier', artisan: { name: 'Hassan Benali' }, cost_final: 450, status: 'done', can_delete: false },
    { id: 12, title: 'Tableau électrique', trade: 'electricien', artisan: null, cost_final: null, status: 'scheduled', can_delete: true },
    { id: 13, title: 'Chauffe-eau', trade: 'plombier', artisan: null, cost_final: null, status: 'in_progress', can_delete: false },
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

  it("crée une intervention dans une popup, pas dans la page", async () => {
    svc.createWorkOrder.mockResolvedValue({ work_order: { id: 14 } })
    renderPage()
    await screen.findByText('Fuite salle de bain')
    // Rien à saisir avant d'avoir demandé la création : la page reste une liste.
    expect(screen.queryByLabelText('Intitulé')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau' }))
    // Sans bien, rien ne part : une intervention se fait quelque part.
    await userEvent.type(screen.getByLabelText('Intitulé'), 'Volet bloqué')
    expect(screen.getByRole('button', { name: "Créer l'intervention" })).toBeDisabled()
    await userEvent.selectOptions(await screen.findByLabelText('Bien concerné'), '5')
    await userEvent.selectOptions(screen.getByLabelText('Métier'), 'electricien')
    await userEvent.selectOptions(await screen.findByRole('option', { name: 'Samira Alaoui' }).then((o) => o.closest('select')), '3')
    await userEvent.click(screen.getByRole('button', { name: "Créer l'intervention" }))
    // Sans nature, aucun des trois champs du payeur ne part : le service les valide ensemble.
    await vi.waitFor(() => expect(svc.createWorkOrder).toHaveBeenCalledWith({
      title: 'Volet bloqué', trade: 'electricien', property_id: 5, client_id: 3, lease_id: 70, artisan_id: null,
      scheduled_date: null, cost_estimate: null, notes: null,
    }))
  })

  async function openCreation() {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau' }))
    await userEvent.type(screen.getByLabelText('Intitulé'), 'Chauffe-eau')
    await userEvent.selectOptions(await screen.findByLabelText('Bien concerné'), '5')
    await screen.findByText(/Loué à Karim Benali/)
  }

  it('exige un client et propose le payeur selon la nature', async () => {
    svc.createWorkOrder.mockResolvedValue({ work_order: { id: 14 } })
    await openCreation()
    // Sans client, la création reste fermée.
    expect(screen.getByRole('button', { name: "Créer l'intervention" })).toBeDisabled()
    await userEvent.selectOptions(await screen.findByLabelText('Client concerné'), '3')
    await userEvent.selectOptions(screen.getByLabelText('Nature des travaux'), 'structurel')
    // La nature propose le propriétaire, et le mode suit (le bien est sous mandat).
    expect(screen.getByLabelText('Qui paie')).toHaveValue('owner')
    expect(screen.getByLabelText('Règlement')).toHaveValue('crg_expense')
    await userEvent.click(screen.getByRole('button', { name: "Créer l'intervention" }))
    await vi.waitFor(() => expect(svc.createWorkOrder).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: 5, client_id: 3, lease_id: 70, nature: 'structurel',
        payer: 'owner', charge_mode: 'crg_expense', third_party_label: null })))
  })

  it("propose le locataire pour de l'entretien quand le bien est loué", async () => {
    await openCreation()
    await userEvent.selectOptions(screen.getByLabelText('Nature des travaux'), 'entretien')
    expect(screen.getByLabelText('Qui paie')).toHaveValue('tenant')
    expect(screen.getByLabelText('Règlement')).toHaveValue('to_rebill')
  })

  it("propose le propriétaire pour de l'entretien quand le bien n'est pas loué", async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau' }))
    await userEvent.selectOptions(await screen.findByLabelText('Bien concerné'), '6')
    expect(await screen.findByText('Pas de bail en cours')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Nature des travaux'), 'entretien')
    expect(screen.getByLabelText('Qui paie')).toHaveValue('owner')
    // Ni mandat ni bail : rien à déduire d'un compte rendu, la dépense se refacture.
    expect(screen.getByLabelText('Règlement')).toHaveValue('to_rebill')
  })

  it('garde le payeur choisi à la main quand la nature change', async () => {
    await openCreation()
    await userEvent.selectOptions(screen.getByLabelText('Nature des travaux'), 'structurel')
    await userEvent.selectOptions(screen.getByLabelText('Qui paie'), 'agency')
    expect(screen.getByLabelText('Règlement')).toHaveValue('absorbed')
    await userEvent.selectOptions(screen.getByLabelText('Nature des travaux'), 'degat_occupant')
    expect(screen.getByLabelText('Qui paie')).toHaveValue('agency')
    expect(screen.getByLabelText('Règlement')).toHaveValue('absorbed')
  })

  it('demande le nom du tiers payeur, et seulement pour lui', async () => {
    svc.createWorkOrder.mockResolvedValue({ work_order: { id: 14 } })
    await openCreation()
    await userEvent.selectOptions(await screen.findByLabelText('Client concerné'), '3')
    await userEvent.selectOptions(screen.getByLabelText('Nature des travaux'), 'degat_occupant')
    expect(screen.queryByLabelText('Nom du tiers payeur')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Qui paie'), 'third_party')
    expect(screen.getByRole('button', { name: "Créer l'intervention" })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Nom du tiers payeur'), 'Assurance Wafa')
    await userEvent.click(screen.getByRole('button', { name: "Créer l'intervention" }))
    await vi.waitFor(() => expect(svc.createWorkOrder).toHaveBeenCalledWith(
      expect.objectContaining({ payer: 'third_party', charge_mode: 'to_rebill', third_party_label: 'Assurance Wafa' })))
  })

  it('affiche le bail en cours du bien sans le faire saisir', async () => {
    await openCreation()
    expect(screen.getByText(/Loué à Karim Benali jusqu'au/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Bail')).not.toBeInTheDocument()
  })

  it("n'offre le retrait que là où le service l'autorise", async () => {
    svc.deleteWorkOrder.mockResolvedValue({ message: 'Bon de travaux supprimé' })
    renderPage()
    const engage = (await screen.findByText('Tableau électrique')).closest('tr')
    const termine = screen.getByText('Fuite salle de bain').closest('tr')
    expect(within(termine).queryByRole('button', { name: "Retirer l'intervention" })).not.toBeInTheDocument()
    await userEvent.click(within(engage).getByRole('button', { name: "Retirer l'intervention" }))
    // Le clic ne retire rien : il demande confirmation, dans une fenêtre du produit.
    expect(svc.deleteWorkOrder).not.toHaveBeenCalled()
    expect(screen.getByText('Retirer cette intervention ?')).toBeInTheDocument()
    expect(screen.getByText(/Tableau électrique.*Planifié/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    await vi.waitFor(() => expect(svc.deleteWorkOrder).toHaveBeenCalledWith(12))
  })

  it("laisse l'intervention en place si on renonce", async () => {
    renderPage()
    const engage = (await screen.findByText('Tableau électrique')).closest('tr')
    await userEvent.click(within(engage).getByRole('button', { name: "Retirer l'intervention" }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByText('Retirer cette intervention ?')).not.toBeInTheDocument()
    expect(svc.deleteWorkOrder).not.toHaveBeenCalled()
  })

  it('filtre les interventions par métier', async () => {
    renderPage()
    await screen.findByText('Fuite salle de bain')
    await userEvent.selectOptions(screen.getByDisplayValue('Tous les métiers'), 'electricien')
    expect(screen.getByText('Tableau électrique')).toBeInTheDocument()
    expect(screen.queryByText('Chauffe-eau')).not.toBeInTheDocument()
  })
})
