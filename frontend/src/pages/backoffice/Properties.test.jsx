import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import useAuthStore from '../../store/authStore'
import api from '../../services/api'
import Properties from './Properties'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const base = {
  property_type: 'apartment', transaction_type: 'sale', city: 'Casablanca', neighborhood: 'Maarif',
  images_count: 3, cover_url: null, description_length: 220, price_ref: null, status_check: null,
  transactions: [], views_count: 100, contacts_count: 2, favorites_count: 0,
}
// Biens tirés du jeu de données de l'agence 1.
const PROPERTIES = [
  { ...base, id: 1, reference: 'SO-CAS-00001', title: 'Appartement calme Maarif', status: 'active', price: 1200000, surface: 80 },
  { ...base, id: 106, reference: 'PROP-202607-0024', title: 'Loft industriel rénové - Bir Rami', status: 'active', property_type: 'land',
    city: 'Kénitra', neighborhood: 'Bir Rami', price: 7030000, surface: 120, images_count: 0, contacts_count: 0, views_count: 335,
    price_ref: { avg: 6000, min: 4500, max: 8000 } },
  { ...base, id: 104, reference: 'PROP-202607-0022', title: 'Maison traditionnelle rénovée - Malabata', status: 'pending', property_type: 'villa',
    city: 'Tanger', neighborhood: 'Malabata', price: 810000, surface: 201,
    status_check: { reason: 'won', expected: 'sold', tone: 'crit', open_count: 1,
      transaction: { stage: 'final_act', status: 'won', amount: 729494, closed_at: '2026-06-26T10:00:00' } },
    transactions: [{ id: 7, stage: 'final_act', status: 'won', amount: 729494, closed_at: '2026-06-26T10:00:00' }] },
]
const DASHBOARD = { widgets: { new_leads: [{ id: 3, property_id: 1, created_at: '2026-07-10T00:00:00' }], upcoming_visits: [] } }

function mockApi({ fail = false } = {}) {
  api.get.mockReset().mockImplementation(async (url) => {
    if (url === '/backoffice/properties/insights') {
      if (fail) throw new Error('net')
      return { data: { properties: PROPERTIES, sources: { price_refs: true, transactions: true } } }
    }
    if (url === '/backoffice/dashboard') return { data: DASHBOARD }
    if (url === '/backoffice/leads') return { data: { leads: [{ id: 3, name: 'Hind Senhaji', source: 'contact_form', status: 'new', created_at: '2026-07-10T00:00:00' }] } }
    if (url === '/backoffice/visits') return { data: { visits: [] } }
    throw new Error(`unexpected ${url}`)
  })
  api.put.mockReset().mockResolvedValue({ data: {} })
  api.delete.mockReset().mockResolvedValue({ data: {} })
}

function renderPage({ features = [] } = {}) {
  useAuthStore.setState({ user: { id: 1, agency_id: 1, features }, accessToken: null, isAuthenticated: true })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><Properties /></MemoryRouter></QueryClientProvider>)
}

const rowOf = async (title) => (await screen.findAllByText(title)).map((el) => el.closest('[class*="border-t"]')).find(Boolean)

describe('Biens immobiliers du back-office', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('fr')
    mockApi()
  })

  it('affiche le titre en FR puis en AR', async () => {
    const { unmount } = renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Biens immobiliers' })).toBeInTheDocument()
    expect(await screen.findByText('3 biens au portefeuille')).toBeInTheDocument()
    unmount()
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'العقارات' })).toBeInTheDocument()
  })

  it('signale un chargement impossible', async () => {
    mockApi({ fail: true })
    renderPage()
    expect(await screen.findByText(/Impossible de charger les biens/)).toBeInTheDocument()
  })

  it('classe « à traiter d’abord » : statut contredit et prix hors marché devant', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Tous les biens' })
    const titles = PROPERTIES.map((p) => p.title)
    const order = [...document.querySelectorAll('b')].map((b) => b.textContent).filter((txt) => titles.includes(txt))
    // Les cartes « à traiter » citent aussi certains biens : on lit l'ordre de la liste, en fin de page.
    expect(order.slice(-3)).toEqual([
      'Loft industriel rénové - Bir Rami', 'Maison traditionnelle rénovée - Malabata', 'Appartement calme Maarif',
    ])
    expect(screen.getByText('Prix × 9,8')).toBeInTheDocument()
    expect(screen.getByText('1 demande à traiter')).toBeInTheDocument()
  })

  it('corrige un statut contredit depuis la carte dépliée, un seul détail à la fois', async () => {
    renderPage()
    const card = (await screen.findByRole('heading', { name: 'Statuts à corriger' })).closest('section')
    await userEvent.click(within(card).getByRole('button', { name: 'Développer' }))
    const detail = () => document.getElementById('dashboard-detail')
    await vi.waitFor(() => expect(within(detail()).getByRole('heading', { level: 2 })).toHaveTextContent('Statuts à corriger'))
    expect(within(detail()).getByText(/gagné au stade acte final/)).toBeInTheDocument()
    await userEvent.click(within(detail()).getByRole('button', { name: 'Appliquer : Passer en vendu' }))
    expect(api.put).toHaveBeenCalledWith('/backoffice/properties/104', { status: 'sold' })

    const photos = screen.getByRole('heading', { name: 'Annonces sans photo' }).closest('section')
    await userEvent.click(within(photos).getByRole('button', { name: 'Développer' }))
    await vi.waitFor(() => expect(within(detail()).getByRole('heading', { level: 2 })).toHaveTextContent('Annonces sans photo'))
    expect(document.querySelectorAll('#dashboard-detail')).toHaveLength(1)
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(detail()).toBeNull(), { timeout: 1000 })
  })

  it('déplie un bien et charge ses demandes à la demande', async () => {
    renderPage()
    const row = await rowOf('Appartement calme Maarif')
    expect(api.get).not.toHaveBeenCalledWith('/backoffice/leads', expect.anything())
    await userEvent.click(within(row).getByRole('button', { name: 'Développer' }))
    const detail = document.getElementById('dashboard-detail')
    expect(await within(detail).findByText('Hind Senhaji')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/backoffice/leads', { params: { property_id: 1, per_page: 50 } })
  })

  it('filtre par recherche et statut, et réinitialise', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Tous les biens' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un bien' }), 'bir rami')
    expect(screen.getByText('1 bien sur 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(screen.getByText('3 biens')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('group', { name: 'Statut' })).getByRole('button', { name: /Sous option/ }))
    expect(screen.getByText('1 bien sur 3')).toBeInTheDocument()
  })

  it('supprime un bien après confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    const row = await rowOf('Appartement calme Maarif')
    await userEvent.click(within(row).getByRole('button', { name: 'Supprimer' }))
    expect(confirm).toHaveBeenCalledWith('Supprimer « Appartement calme Maarif » ? Cette action est définitive.')
    expect(api.delete).toHaveBeenCalledWith('/backoffice/properties/1')
    confirm.mockRestore()
  })
})

describe('Biens immobiliers — entrée design3d', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mockApi()
  })

  it('propose « Concevoir en 3D » parmi les actions en icônes quand le module est actif', async () => {
    renderPage({ features: ['design3d'] })
    const row = await rowOf('Appartement calme Maarif')
    const item = within(row).getByRole('link', { name: /Concevoir en 3D/i })
    expect(item).toHaveAttribute('href', '/dashboard/conception?target_type=property&target_id=1')
    // Même forme que ses voisines : une icône, le libellé en infobulle.
    expect(item.className).toBe(within(row).getByRole('link', { name: 'Modifier' }).className)
    expect(within(item).getByRole('tooltip')).toHaveTextContent(/Concevoir en 3D/i)
  })

  it('ne propose rien quand le module est inactif', async () => {
    renderPage({ features: [] })
    await rowOf('Appartement calme Maarif')
    expect(screen.queryByRole('link', { name: /Concevoir en 3D/i })).not.toBeInTheDocument()
  })
})
