import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import ContractCreate from './ContractCreate'

const { svc, api } = vi.hoisted(() => ({
  svc: { listTemplates: vi.fn(), create: vi.fn() },
  api: { get: vi.fn() },
}))
vi.mock('../../../services/contractService', () => ({ contractService: svc }))
vi.mock('../../../services/api', () => ({ default: api }))

const TEMPLATES = {
  templates: [{
    id: 1, name: 'Mandat de vente', is_global: true,
    body_html: '<h1>Mandat</h1><p>Vendeur &amp; acheteur&nbsp;: 5 &lt; 6</p><p></p><p></p><p>Fait à Rabat</p>',
  }],
}

const PROPERTIES = { properties: [
  { id: 1, title: 'Villa Anfa', city: 'Casablanca' },
  { id: 2, title: 'Riad Médina', city: 'Fès' },
  { id: 3, title: 'Studio Agdal', city: 'Rabat' },
] }
const CLIENTS = { clients: [
  { id: 10, first_name: 'Sara', last_name: 'Bennani' },
  { id: 11, first_name: 'Omar', last_name: 'Tazi' },
  { id: 12, first_name: 'Nadia', last_name: 'Idrissi' },
] }
const TRANSACTIONS = [
  { id: 100, reference: 'TX-100', property_id: 1, property_title: 'Villa Anfa', client_id: 10, client_name: 'Sara Bennani' },
  { id: 101, reference: 'TX-101', property_id: 1, property_title: 'Villa Anfa', client_id: 11, client_name: 'Omar Tazi' },
  { id: 102, reference: 'TX-102', property_id: 2, property_title: 'Riad Médina', client_id: 12, client_name: 'Nadia Idrissi' },
]

// Reproduit le filtre property_id du backend pour que la cascade soit vraiment pilotée par l'API.
function mockApi() {
  api.get.mockImplementation(async (url, config) => {
    if (url.includes('/properties')) return { data: PROPERTIES }
    if (url.includes('/clients')) return { data: CLIENTS }
    const pid = config?.params?.property_id
    return { data: { transactions: TRANSACTIONS.filter((tx) => !pid || tx.property_id === pid) } }
  })
}

// SearchableSelect n'associe pas son <label> : on remonte du libellé du champ à son bouton.
const field = (label) => within(screen.getByText(label).parentElement).getByRole('button')
const open = (label) => userEvent.click(field(label))
const choose = async (label, option) => {
  await open(label)
  await userEvent.click(await screen.findByRole('button', { name: option }))
}
const offered = async (label) => {
  await open(label)
  const names = screen.queryAllByRole('listitem').map((li) => li.querySelector('span.block')?.textContent ?? li.textContent)
  await userEvent.keyboard('{Escape}')
  return names
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ContractCreate /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Nouveau contrat', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    svc.listTemplates.mockReset().mockResolvedValue(TEMPLATES)
    api.get.mockReset()
    mockApi()
  })

  it("montre le texte du modèle, sans balises HTML", async () => {
    renderPage()
    await userEvent.selectOptions(await screen.findByRole('combobox'), '1')
    const preview = await screen.findByText(/Fait à Rabat/)
    expect(preview.textContent).toBe('Mandat\nVendeur & acheteur : 5 < 6\n\nFait à Rabat')
    expect(preview.textContent).not.toMatch(/<\/?[a-z]/i)
    expect(screen.queryByText(/pas de contenu de prévisualisation/)).not.toBeInTheDocument()
  })

  describe('rattachement en cascade', () => {
    it('un bien restreint les transactions et les clients à ses transactions', async () => {
      renderPage()
      await choose('Bien', /Villa Anfa/)
      await vi.waitFor(async () => {
        expect(await offered('Transaction liée')).toEqual(['TX-100 · Villa Anfa', 'TX-101 · Villa Anfa'])
      })
      expect(await offered('Client')).toEqual(['Sara Bennani', 'Omar Tazi'])
    })

    it('une transaction renseigne son bien et son client', async () => {
      renderPage()
      await choose('Transaction liée', /TX-102/)
      expect(field('Bien')).toHaveTextContent('Riad Médina')
      expect(field('Client')).toHaveTextContent('Nadia Idrissi')
    })

    it('changer de bien vide le client qui ne lui appartient plus', async () => {
      renderPage()
      await choose('Bien', /Villa Anfa/)
      await choose('Client', /Sara Bennani/)
      expect(field('Client')).toHaveTextContent('Sara Bennani')
      await choose('Bien', /Riad Médina/)
      await vi.waitFor(() => expect(field('Client')).toHaveTextContent('—'))
      expect(field('Transaction liée')).toHaveTextContent('Aucune')
    })

    it('un client déjà choisi survit au changement de bien quand il y a une transaction', async () => {
      renderPage()
      await choose('Client', /Nadia Idrissi/)
      await choose('Bien', /Riad Médina/)
      await vi.waitFor(async () => expect(await offered('Transaction liée')).toEqual(['TX-102 · Riad Médina']))
      expect(field('Client')).toHaveTextContent('Nadia Idrissi')
    })

    it('un bien sans transaction propose tous les clients et le dit', async () => {
      renderPage()
      await choose('Bien', /Studio Agdal/)
      expect(await screen.findByText(/Aucune transaction pour ce bien/)).toBeInTheDocument()
      expect(await offered('Client')).toEqual(['Sara Bennani', 'Omar Tazi', 'Nadia Idrissi'])
      expect(await offered('Transaction liée')).toEqual(['Aucun résultat'])
    })
  })
})
