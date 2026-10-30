import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import WorkOrderDetail from './WorkOrderDetail'

const { svc } = vi.hoisted(() => ({
  svc: { getWorkOrder: vi.fn(), listArtisans: vi.fn(), listTrades: vi.fn(), updateWorkOrder: vi.fn() },
}))
vi.mock('../../../services/artisanService', () => ({ artisanService: svc }))
const API = {
  '/backoffice/clients?per_page=100': { clients: [{ id: 3, first_name: 'Samira', last_name: 'Alaoui' }] },
  '/backoffice/gestion-locative/mandates': { mandates: [
    { id: 9, property_id: 5, status: 'active' }, { id: 3, property_id: 99, status: 'active' },
  ] },
}
// Une réponse qui n'arrive jamais : la fiche reste en chargement des mandats.
const NEVER = Symbol('never')
vi.mock('../../../services/api', () => ({
  default: { get: vi.fn((url) => (API[url] === NEVER ? new Promise(() => {}) : Promise.resolve({ data: API[url] }))) },
}))

const WO = { id: 4, title: 'Chauffe-eau', trade: 'plombier', status: 'done', property_id: 5, client_id: 3,
  lease_id: 70, payer: 'owner', charge_mode: 'crg_expense', cost_final: 1200 }

function renderDetail(workOrder) {
  svc.getWorkOrder.mockResolvedValue({ work_order: workOrder })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/backoffice/tiers/interventions/4']}>
        <Routes><Route path="/backoffice/tiers/interventions/:id" element={<WorkOrderDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Fiche d\'intervention : règlement', () => {
  beforeEach(async () => {
    API['/backoffice/gestion-locative/mandates'] = { mandates: [
      { id: 9, property_id: 5, status: 'active' }, { id: 3, property_id: 99, status: 'active' },
    ] }
    await i18n.changeLanguage('fr')
    svc.listArtisans.mockResolvedValue({ artisans: [] })
    svc.listTrades.mockResolvedValue({ trades: [{ id: 'plombier', label: 'Plombier' }] })
  })

  it('dit où la dépense a atterri : le compte rendu du mandat unique du bien', async () => {
    renderDetail({ ...WO, charged_ref: 'crg:12' })
    expect(await screen.findByText('Propriétaire')).toBeInTheDocument()
    expect(await screen.findByText('Samira Alaoui')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /compte rendu/i })).toHaveAttribute('href', '/backoffice/gestion-locative/mandats/9')
  })

  it("n'affiche rien sur l'imputation tant que les mandats chargent", async () => {
    API['/backoffice/gestion-locative/mandates'] = NEVER
    renderDetail({ ...WO, charged_ref: 'crg:12' })
    await screen.findByText('Propriétaire')
    expect(screen.queryByText(/compte rendu n° 12/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /compte rendu/i })).not.toBeInTheDocument()
  })

  it.each([
    ['deux mandats actifs', [{ id: 8, property_id: 5, status: 'active' }, { id: 9, property_id: 5, status: 'active' }]],
    ['un mandat expiré à côté du nouveau', [{ id: 8, property_id: 5, status: 'expired' }, { id: 9, property_id: 5, status: 'active' }]],
    ['aucun mandat', [{ id: 3, property_id: 99, status: 'active' }]],
  ])('ne devine pas le mandat : %s', async (_, mandates) => {
    API['/backoffice/gestion-locative/mandates'] = { mandates }
    renderDetail({ ...WO, charged_ref: 'crg:12' })
    // Ce texte n'est rendu qu'une fois les mandats chargés : l'attendre épingle l'absence de lien
    // sur la réponse reçue, pas sur un chargement en cours.
    expect(await screen.findByText(/compte rendu n° 12/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /compte rendu/i })).not.toBeInTheDocument()
  })

  it('mène au décompte du bail quand la dépense a été retenue sur la caution', async () => {
    renderDetail({ ...WO, payer: 'tenant', charge_mode: 'deposit_deduction', charged_ref: 'settlement:3' })
    expect(await screen.findByRole('link', { name: /décompte/i })).toHaveAttribute('href', '/backoffice/gestion-locative/decompte/70')
  })

  it("n'affiche aucun lien tant que la dépense n'a pas été imputée", async () => {
    renderDetail({ ...WO, charged_ref: null })
    await screen.findByText('Propriétaire')
    expect(screen.queryByRole('link', { name: /compte rendu|décompte/i })).not.toBeInTheDocument()
  })

  it('nomme le tiers payeur', async () => {
    renderDetail({ ...WO, payer: 'third_party', charge_mode: 'to_rebill', third_party_label: 'Assurance Wafa', charged_ref: null })
    expect(await screen.findByText('Assurance Wafa')).toBeInTheDocument()
  })
})
