import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import TransactionCreate from './TransactionCreate'

const PROPERTIES = [
  {
    id: 4, reference: 'PROP-202607-0004', title: 'Villa Souissi', property_type: 'villa',
    transaction_type: 'sale', price: 6800000, surface: 320, bedrooms: 5,
    city: 'Rabat', neighborhood: 'Souissi', status: 'active',
  },
  {
    id: 7, reference: 'PROP-202607-0007', title: 'Appartement Maarif', property_type: 'apartment',
    transaction_type: 'rent', price: 9000, surface: 95, bedrooms: 2,
    city: 'Casablanca', neighborhood: 'Maarif', status: 'active',
  },
]
const CLIENTS = [{ id: 11, first_name: 'Salma', last_name: 'Idrissi', email: 'salma@example.ma' }]
const PINNED = { id: 42, first_name: 'Rachid', last_name: 'Kettani', email: 'rachid@example.ma' }

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const calls = () => api.get.mock.calls.map(([url]) => url)

function renderPage(search = '') {
  api.get.mockImplementation(async (url) => {
    if (url === '/backoffice/settings') return { data: { default_sale_commission_fee: 12000, default_rental_commission_rate: 50 } }
    if (url.startsWith('/backoffice/clients/')) return { data: { client: PINNED } }
    if (url.startsWith('/backoffice/clients')) return { data: { clients: CLIENTS, total: 1, pages: 1 } }
    if (url.startsWith('/backoffice/properties/')) return { data: { property: PROPERTIES[0] } }
    const keep = url.includes('min_surface=200') ? [PROPERTIES[0]] : PROPERTIES
    return { data: { properties: keep, total: keep.length, pages: 1, current_page: 1 } }
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/backoffice/transactions/nouveau${search}`]}><TransactionCreate /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Création d’une transaction', () => {
  beforeEach(async () => {
    api.get.mockReset()
    api.post.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('cherche le bien avant le formulaire, et ne montre les détails qu’après sélection', async () => {
    renderPage()
    expect(await screen.findByText('Rechercher le bien')).toBeInTheDocument()
    expect(await screen.findByText('Villa Souissi')).toBeInTheDocument()
    expect(screen.queryByText('Détails')).not.toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Choisir' })[0])

    expect(await screen.findByText('Bien choisi')).toBeInTheDocument()
    expect(screen.getByText('Détails')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Changer de bien' })).toBeInTheDocument()
  })

  it('envoie les critères détaillés au service des biens', async () => {
    renderPage()
    await screen.findByText('Villa Souissi')

    await userEvent.type(screen.getByLabelText('Surface min. (m²)'), '200')

    await screen.findByText('1 bien(s) trouvé(s)')
    const last = calls().filter((u) => u.startsWith('/backoffice/properties?')).at(-1)
    expect(last).toContain('min_surface=200')
    expect(screen.queryByText('Appartement Maarif')).not.toBeInTheDocument()
  })

  it('pré-sélectionne le client venu de sa fiche, même hors de la première page', async () => {
    renderPage('?client_id=42&type=rent&property_id=4')

    expect(await screen.findByText('Bien choisi')).toBeInTheDocument()   // étape de recherche sautée
    expect(await screen.findByText('Rachid Kettani')).toBeInTheDocument()
    expect(calls()).toContain('/backoffice/clients/42')
    // Les clients proposés sont ceux du service, cloisonné à l'agence de l'agent connecté.
    expect(calls()).toContain('/backoffice/clients?per_page=200')
  })

  it('crée la transaction sur le bien choisi et le client retenu', async () => {
    api.post.mockResolvedValue({ data: { id: 77 } })
    renderPage('?client_id=42&property_id=4')
    await screen.findByText('Bien choisi')
    await screen.findByText('Rachid Kettani')

    await userEvent.click(screen.getByRole('button', { name: 'Créer la transaction' }))

    expect(api.post).toHaveBeenCalledWith('/backoffice/transactions', expect.objectContaining({
      property_id: 4, client_id: 42, commission_amount: 12000,
    }))
  })

  it('pose le barème de l’agence : forfait en vente, pourcentage du loyer en location', async () => {
    renderPage()
    await screen.findByText('Villa Souissi')
    await userEvent.click(screen.getAllByRole('button', { name: 'Choisir' })[0])   // vente

    expect(await screen.findByDisplayValue('12000')).toBeInTheDocument()
    expect(screen.getByText(/Tarif fixe de l’agence|Tarif fixe de l'agence/)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'rent')
    expect(await screen.findByDisplayValue('50')).toBeInTheDocument()
    // 50 % du loyer repris du bien : l'agent voit le montant avant d'enregistrer.
    expect(screen.getByText(/soit 3\s?400\s?000 Dh/)).toBeInTheDocument()
  })

  it('rend l’étape de recherche en arabe', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('البحث عن العقار')).toBeInTheDocument()
  })
})
