import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import Pipeline from './Pipeline'

const STAGES = ['contact', 'visit', 'offer', 'negotiation', 'compromise', 'final_act'].map((id, order) => ({ id, name: id, order }))
const card = (o) => ({ asking_price: 1000000, probability: 50, priority: 'medium', created_at: '2026-07-24T00:00:00', flags: [], ...o })
const SALE = {
  stages: STAGES,
  closed_recent: [{ id: 9, status: 'lost', stage: 'negotiation', amount: 6720318, lost_reason: 'Prix trop élevé' }],
  pipeline: STAGES.map((s) => ({ ...s, transactions: [] })),
}
SALE.pipeline[1].transactions = [card({ id: 5, reference: 'TX-5', client_name: 'Rachid Ziani', property_title: 'Maison', agent_id: 20, agent_name: 'Omar Sefrioui', days_in_stage: 3, stage_entered_at: '2026-07-24T00:30:00',
  flags: [{ code: 'unrealistic_close', severity: 'warn', params: { date: '2026-08-25', days: 29, stage: 'visit' } }] })]
SALE.pipeline[3].transactions = [card({ id: 3, reference: 'TX-3', client_name: 'Aicha Alaoui', property_title: 'Appartement', agent_id: 20, agent_name: 'Omar Sefrioui', days_in_stage: 32,
  flags: [{ code: 'stale', severity: 'crit', params: { days: 32, stage: 'negotiation' } }] })]
SALE.pipeline[0].transactions = [card({ id: 13, reference: 'TX-13', client_name: 'Aicha Tazi', property_title: 'Riad', agent_id: 18, agent_name: 'Ahmed Ouali', days_in_stage: 3 })]
const RENT = { stages: [], closed_recent: [], pipeline: [] }

// Le « serveur » applique les déplacements : le rechargement qui suit une mutation les reflète.
let server = null
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(async (url) => ({ data: structuredClone(url.includes('type=rent') ? RENT : server) })),
    post: vi.fn(async (url, body) => {
      const id = Number(url.split('/')[3])
      const tx = server.pipeline.flatMap((s) => s.transactions).find((x) => x.id === id)
      server.pipeline.forEach((s) => { s.transactions = s.transactions.filter((x) => x.id !== id) })
      server.pipeline.find((s) => s.id === body.stage).transactions.push({ ...tx, stage: body.stage })
      return { data: {} }
    }),
    delete: vi.fn(async () => ({ data: {} })),
  },
}))

function renderPipeline() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><Pipeline /></MemoryRouter></QueryClientProvider>)
}
const lane = (name) => screen.getByRole('region', { name: new RegExp(`^${name} :`) })

describe('Pipeline', () => {
  beforeEach(async () => {
    localStorage.clear()
    vi.clearAllMocks()
    server = structuredClone(SALE)
    await i18n.changeLanguage('fr')
  })

  it('affiche le titre en FR puis en AR', async () => {
    const { unmount } = renderPipeline()
    expect(await screen.findByRole('heading', { level: 1, name: 'Pipeline' })).toBeInTheDocument()
    unmount()
    await i18n.changeLanguage('ar')
    renderPipeline()
    expect(await screen.findByRole('heading', { level: 1, name: 'مسار الصفقات' })).toBeInTheDocument()
  })

  it('liste les constats du plus grave au moins grave et ouvre la carte concernée', async () => {
    const user = userEvent.setup()
    renderPipeline()
    const todo = (await screen.findByRole('heading', { name: 'À traiter en priorité' })).closest('section')
    const titles = within(todo).getAllByRole('listitem').map((li) => li.querySelector('b').textContent)
    expect(titles).toEqual(['32 jours sans changement d\'étape', 'Clôture prévue irréaliste'])
    expect(screen.getByText('6,7 M Dh perdus, dont 6,7 M Dh en négociation (Prix trop élevé)')).toBeInTheDocument()

    await user.click(within(todo).getByRole('button', { name: 'Voir le dossier TX-3' }))
    expect(within(lane('Négociation')).getByRole('button', { name: 'Replier le dossier TX-3' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('déplace une carte au clavier, puis annule en lui rendant sa date d\'entrée', async () => {
    const user = userEvent.setup()
    renderPipeline()
    await user.click(await screen.findByRole('button', { name: 'Déplier le dossier TX-5' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Déplacer TX-5 vers une autre étape' }), 'offer')

    expect(api.post).toHaveBeenLastCalledWith('/backoffice/transactions/5/move', { stage: 'offer', order: 0 })
    expect(within(lane('Offre')).getByText('Rachid Ziani')).toBeInTheDocument()
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('TX-5 passé en Offre')

    await user.click(within(toast).getByRole('button', { name: 'Annuler' }))
    expect(api.post).toHaveBeenLastCalledWith('/backoffice/transactions/5/move', { stage: 'visit', order: 0, stage_entered_at: '2026-07-24T00:30:00' })
    expect(within(lane('Visite')).getByText('Rachid Ziani')).toBeInTheDocument()
  })

  it('filtre par agent depuis la charge, sur « à traiter » et par recherche', async () => {
    const user = userEvent.setup()
    renderPipeline()
    await screen.findByText('Aicha Tazi')
    await user.click(screen.getByRole('button', { name: /^Ahmed Ouali :/ }))
    expect(screen.queryByText('Aicha Alaoui')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Ahmed Ouali :/ }))

    await user.click(screen.getByRole('button', { name: 'À traiter' }))
    expect(screen.queryByText('Aicha Tazi')).not.toBeInTheDocument()
    expect(within(lane('Contact')).getByText('Masqués par le filtre')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tous les dossiers' }))

    await user.type(screen.getByRole('searchbox', { name: 'Filtrer les dossiers du pipeline' }), 'riad')
    expect(screen.getByText('Aicha Tazi')).toBeInTheDocument()
    expect(screen.queryByText('Rachid Ziani')).not.toBeInTheDocument()
  })

  it('bascule sur la location sans additionner les ventes', async () => {
    const user = userEvent.setup()
    renderPipeline()
    await screen.findByText('Aicha Tazi')
    await user.click(screen.getByRole('button', { name: 'Location' }))
    expect(api.get).toHaveBeenLastCalledWith('/backoffice/transactions/pipeline?type=rent')
    expect(await screen.findByText('Aucun dossier ne demande d\'action')).toBeInTheDocument()
    expect(screen.queryByText('Aicha Tazi')).not.toBeInTheDocument()
  })
})
