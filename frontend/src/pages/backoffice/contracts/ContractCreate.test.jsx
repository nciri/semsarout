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
    const { property_id: pid, client_id: cid, per_page: perPage } = config?.params ?? {}
    const rows = TRANSACTIONS.filter((tx) => (!pid || tx.property_id === pid) && (!cid || tx.client_id === Number(cid)))
    return { data: { transactions: perPage === 1 ? rows.slice(0, 1) : rows } }
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
  const names = screen.queryAllByRole('listitem').map((li) => within(li).queryByRole('button')?.textContent ?? li.textContent)
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
    svc.create.mockReset().mockResolvedValue({ contract: { id: 5 } })
    api.get.mockReset()
    mockApi()
  })

  it("montre le texte du modèle, sans balises HTML", async () => {
    renderPage()
    await userEvent.selectOptions((await screen.findAllByRole('combobox'))[0], '1')
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
        expect(await offered('Transaction liée')).toEqual(['TX-100 · Villa AnfaSara Bennani', 'TX-101 · Villa AnfaOmar Tazi'])
      })
      expect(await offered('Client 1')).toEqual(['Sara Bennani', 'Omar Tazi'])
    })

    it('une transaction renseigne son bien et son client', async () => {
      renderPage()
      await choose('Transaction liée', /TX-102/)
      expect(field('Bien')).toHaveTextContent('Riad Médina')
      expect(field('Client 1')).toHaveTextContent('Nadia Idrissi')
    })

    it('changer de bien vide le client qui ne lui appartient plus', async () => {
      renderPage()
      await choose('Bien', /Villa Anfa/)
      await choose('Client 1', /Sara Bennani/)
      expect(field('Client 1')).toHaveTextContent('Sara Bennani')
      await choose('Bien', /Riad Médina/)
      await vi.waitFor(() => expect(field('Client 1')).toHaveTextContent('—'))
      expect(field('Transaction liée')).toHaveTextContent('Aucune')
    })

    it('un client déjà choisi survit au changement de bien quand il y a une transaction', async () => {
      renderPage()
      await choose('Client 1', /Nadia Idrissi/)
      await choose('Bien', /Riad Médina/)
      await vi.waitFor(async () => expect(await offered('Transaction liée')).toEqual(['TX-102 · Riad MédinaNadia Idrissi']))
      expect(field('Client 1')).toHaveTextContent('Nadia Idrissi')
    })

    it('un bien sans transaction propose tous les clients et le dit', async () => {
      renderPage()
      await choose('Bien', /Studio Agdal/)
      expect(await screen.findByText(/Aucune transaction pour ce bien/)).toBeInTheDocument()
      await choose('Bien', /Villa Anfa/)
      await vi.waitFor(() => expect(screen.queryByText(/Aucune transaction pour ce bien/)).not.toBeInTheDocument())
      await choose('Bien', /Studio Agdal/)
      await screen.findByText(/Aucune transaction pour ce bien/)
      expect(await offered('Client 1')).toEqual(['Sara Bennani', 'Omar Tazi', 'Nadia Idrissi'])
      expect(await offered('Transaction liée')).toEqual(['Aucun résultat'])
    })

    it("changer de bien vide la transaction qui n'en est plus", async () => {
      renderPage()
      await choose('Bien', /Villa Anfa/)
      await choose('Transaction liée', /TX-100/)
      await choose('Bien', /Riad Médina/)
      await vi.waitFor(() => expect(field('Transaction liée')).toHaveTextContent('Aucune'))
    })

    it('vider le bien vide aussi la transaction', async () => {
      renderPage()
      await choose('Transaction liée', /TX-100/)
      expect(field('Bien')).toHaveTextContent('Villa Anfa')
      await userEvent.click(within(screen.getByText('Bien').parentElement).getByRole('button').querySelector('svg'))
      expect(field('Bien')).toHaveTextContent('—')
      expect(field('Transaction liée')).toHaveTextContent('Aucune')
    })

    it('vider le client garde la transaction choisie', async () => {
      renderPage()
      await choose('Transaction liée', /TX-100/)
      await userEvent.click(field('Client 1').querySelector('svg'))
      expect(field('Client 1')).toHaveTextContent('—')
      expect(field('Transaction liée')).toHaveTextContent('TX-100')
    })

    it('sans bien, le client filtre les transactions côté serveur', async () => {
      renderPage()
      await choose('Client 1', /Omar Tazi/)
      await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith(
        '/backoffice/transactions',
        { params: expect.objectContaining({ client_id: 11 }) },
      ))
      await vi.waitFor(async () => expect(await offered('Transaction liée')).toEqual(['TX-101 · Villa AnfaOmar Tazi']))
    })

    it("nomme le client d'une transaction sans client_name depuis la liste des clients", async () => {
      TRANSACTIONS.push({ id: 104, reference: 'TX-104', property_id: 3, property_title: 'Studio Agdal', client_id: 11, client_name: null })
      try {
        renderPage()
        await choose('Bien', /Studio Agdal/)
        await vi.waitFor(async () => expect(await offered('Client 1')).toEqual(['Omar Tazi']))
      } finally {
        TRANSACTIONS.pop()
      }
    })
  })

  describe('parties multiples', () => {
    const submit = () => userEvent.click(screen.getByRole('button', { name: /Créer le contrat/ }))
    const pickRole = async (n, role) => userEvent.selectOptions(
      within(screen.getByText(`Rôle ${n}`).parentElement).getByRole('combobox'), role,
    )

    it('porte plusieurs vendeurs et plusieurs locataires dans le payload', async () => {
      renderPage()
      await userEvent.selectOptions((await screen.findAllByRole('combobox'))[0], '1')
      await pickRole(1, 'vendeur')
      await choose('Client 1', /Sara Bennani/)
      await userEvent.click(screen.getByRole('button', { name: /Ajouter une partie/ }))
      await choose('Client 2', /Omar Tazi/)
      await userEvent.click(screen.getByRole('button', { name: /Ajouter une partie/ }))
      await pickRole(3, 'locataire')
      await choose('Client 3', /Nadia Idrissi/)
      await submit()
      expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({
        parties: [
          { client_id: 10, role: 'vendeur' },
          { client_id: 11, role: 'vendeur' },
          { client_id: 12, role: 'locataire' },
        ],
      }))
    })

    it('une partie de plus reprend le rôle de la précédente', async () => {
      renderPage()
      await pickRole(1, 'bailleur')
      await userEvent.click(screen.getByRole('button', { name: /Ajouter une partie/ }))
      expect(within(screen.getByText('Rôle 2').parentElement).getByRole('combobox')).toHaveValue('bailleur')
    })

    it('retirer une partie la sort du formulaire et du payload', async () => {
      renderPage()
      await userEvent.selectOptions((await screen.findAllByRole('combobox'))[0], '1')
      await pickRole(1, 'vendeur')
      await choose('Client 1', /Sara Bennani/)
      await userEvent.click(screen.getByRole('button', { name: /Ajouter une partie/ }))
      await choose('Client 2', /Omar Tazi/)
      await userEvent.click(screen.getAllByTitle('Retirer cette partie')[1])
      expect(screen.queryByText('Client 2')).not.toBeInTheDocument()
      await submit()
      expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({
        parties: [{ client_id: 10, role: 'vendeur' }],
      }))
    })

    it('la dernière partie ne peut pas être retirée', async () => {
      renderPage()
      expect(screen.getByTitle('Retirer cette partie')).toBeDisabled()
    })

    it('une ligne sans rôle ou sans client ne part pas au serveur', async () => {
      renderPage()
      await userEvent.selectOptions((await screen.findAllByRole('combobox'))[0], '1')
      await choose('Client 1', /Sara Bennani/)
      await submit()
      expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({ parties: [] }))
    })

    it("une transaction renseigne le client de la première partie", async () => {
      renderPage()
      await choose('Transaction liée', /TX-102/)
      expect(field('Client 1')).toHaveTextContent('Nadia Idrissi')
    })

    // Les notes sont saisies en WYSIWYG : ce qui part est du HTML, assaini par le champ.
    it('envoie les notes du contrat en HTML nettoye', async () => {
      renderPage()
      // Le bouton reste désactivé sans modèle : on en choisit un comme les cas voisins.
      await userEvent.selectOptions((await screen.findAllByRole('combobox'))[0], '1')
      const editor = screen.getByRole('textbox', { name: 'Notes / clauses particulières' })
      editor.innerHTML = '<p>Signature <b>differee</b></p><script>alert(1)</script>'
      await userEvent.click(editor)
      await userEvent.tab()

      await submit()
      expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({
        notes: '<p>Signature <b>differee</b></p>',
      }))
    })

    // Un éditeur vidé rend `<p><br></p>` : du HTML valide, mais sans contenu. Envoyé tel
    // quel, le service y verrait une note renseignée.
    it('n\'envoie pas de notes quand l\'editeur est vide', async () => {
      renderPage()
      await userEvent.selectOptions((await screen.findAllByRole('combobox'))[0], '1')
      const editor = screen.getByRole('textbox', { name: 'Notes / clauses particulières' })
      editor.innerHTML = '<p><br></p>'
      await userEvent.click(editor)
      await userEvent.tab()

      await submit()
      expect(svc.create.mock.calls.at(-1)[0].notes).toBeUndefined()
    })
  })
})
