import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import Clients from './Clients'

const iso = (days) => new Date(Date.now() + days * 864e5).toISOString()

const CLIENTS = [
  { id: 1, first_name: 'Aicha', last_name: 'Tazi', client_type: 'buyer', status: 'prospect', city: 'Casablanca',
    email: 'client24@email.com', phone: '+212 667955639', assigned_to_id: 20, assigned_to_name: 'Omar Berrada', tags: [] },
  { id: 2, first_name: 'Omar', last_name: 'Belhaj', client_type: 'tenant', status: 'active', city: 'Rabat',
    email: 'client15@email.com', phone: '+212 628800129', assigned_to_id: 18, assigned_to_name: 'Ahmed Tazi', tags: ['VIP'] },
  { id: 3, first_name: 'Karim', last_name: 'Tazi', client_type: 'landlord', status: 'inactive', city: 'Marrakech',
    assigned_to_id: 19, assigned_to_name: 'Salma Fassi', tags: [] },
]
const SUMMARY = {
  clients: [
    { id: 1, last_exchange_at: null, interactions_count: 0, visits: [], leads: [] },
    { id: 2, last_exchange_at: iso(-3), interactions_count: 1, leads: [], visits: [
      { id: 5, property_id: 106, property_title: 'Loft Bir Rami', scheduled_at: iso(-3), status: 'completed', client_feedback: 'very_interested' },
    ] },
    { id: 3, last_exchange_at: iso(-40), interactions_count: 1, visits: [], leads: [] },
  ],
  duplicates: [],
}
const TX = [{ id: 9, client_id: 1, property_id: 98, property_title: 'Studio Médina', status: 'active', stage: 'final_act',
  transaction_type: 'sale', asking_price: 4670000, offer_price: 4269747, contact_date: iso(-60) }]

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), delete: vi.fn(async () => ({ data: {} })) } }))

function renderClients() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><Clients /></MemoryRouter></QueryClientProvider>)
}

const rowOf = (name) => screen.getByRole('button', { name: `Développer la fiche de ${name}` }).closest('.grid')

describe('Page Clients du back-office', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('fr')
    api.get.mockImplementation(async (url) => ({
      data: url.includes('/summary') ? SUMMARY
        : url.includes('/history') ? { events: [], duplicates: [] }
          : url.includes('/transactions') ? { transactions: TX }
            : url.includes('/properties') ? { properties: [] }
              : { clients: CLIENTS },
    }))
  })

  it('affiche le titre en FR puis en AR', async () => {
    const { unmount } = renderClients()
    expect(await screen.findByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument()
    unmount()
    await i18n.changeLanguage('ar')
    renderClients()
    expect(await screen.findByRole('heading', { level: 1, name: 'العملاء' })).toBeInTheDocument()
  })

  it('ouvre au premier passage la fiche du client le plus urgent, coordonnées masquées', async () => {
    renderClients()
    const detail = await screen.findByRole('region', { name: 'Aicha Tazi' })
    expect(within(detail).getByText('c•••@email.com')).toBeInTheDocument()
    expect(within(detail).getByText('+212 6••••••39')).toBeInTheDocument()
    expect(within(detail).queryByText('client24@email.com')).not.toBeInTheDocument()
    // Transaction à l'acte final sans aucun échange noté : le constat le plus urgent.
    expect(within(detail).getByText(/1 transaction en cours/)).toBeInTheDocument()
  })

  it('segmente la liste par étape et cherche dans les étiquettes', async () => {
    const user = userEvent.setup()
    renderClients()
    await screen.findByRole('button', { name: 'Développer la fiche de Omar Belhaj' })
    await user.click(screen.getByRole('button', { name: /A visité/ }))
    expect(screen.queryByRole('button', { name: 'Développer la fiche de Aicha Tazi' })).not.toBeInTheDocument()
    expect(rowOf('Omar Belhaj')).toHaveTextContent('Très intéressé, sans offre')
    await user.click(screen.getByRole('button', { name: /Tous/ }))
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un client' }), 'vip')
    expect(screen.getAllByRole('button', { name: /Développer la fiche de/ })).toHaveLength(1)
    expect(screen.getByText(/client affiché/)).toHaveTextContent('1 client affiché sur 3 · les inactifs en fin de liste')
  })

  it('un seul détail ouvert à la fois, Échap referme', async () => {
    const user = userEvent.setup()
    renderClients()
    await screen.findByRole('region', { name: 'Aicha Tazi' })
    const relances = screen.getByRole('heading', { name: 'Relances en retard' }).closest('section')
    await user.click(within(relances).getByRole('button', { name: 'Développer' }))
    // Chaque carte est elle-même une région nommée : le détail se repère par son identifiant.
    const detail = () => document.getElementById('dashboard-detail')
    await waitFor(() => expect(detail()).toHaveAccessibleName('Relances en retard'))
    expect(screen.queryByRole('region', { name: 'Aicha Tazi' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(detail()).toBeNull())
  })

  it('supprime un client après confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderClients()
    const detail = await screen.findByRole('region', { name: 'Aicha Tazi' })
    await user.click(within(detail).getByRole('button', { name: 'Supprimer le client' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(api.delete).toHaveBeenCalledWith('/backoffice/clients/1')
  })
})
