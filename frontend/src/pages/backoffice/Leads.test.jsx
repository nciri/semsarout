import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import Leads from './Leads'

const iso = (days) => new Date(Date.now() + days * 864e5).toISOString()

const LEADS = [
  { id: 1, name: 'Hind Senhaji', phone: '0612345678', email: 'hind@example.ma', status: 'new', source: 'phone_reveal',
    message: 'Toujours disponible ?', property_id: 4, property_title: 'F4 Rabat', created_at: iso(-33) },
  { id: 2, name: 'Omar Alaoui', status: 'converted', source: 'website', created_at: iso(-50),
    contacted_at: iso(-48), converted_at: iso(-40) },
]
const ROUTES = {
  '/backoffice/leads/stats': {
    by_status: [{ status: 'new', count: 15 }, { status: 'contacted', count: 8 }, { status: 'qualified', count: 2 },
      { status: 'converted', count: 5 }, { status: 'lost', count: 2 }],
    by_source: [{ source: 'phone_reveal', count: 8 }, { source: 'website', count: 24 }],
  },
  '/backoffice/leads/agents': { agents: [{ id: 7, name: 'Salma Agent' }] },
  '/backoffice/dashboard': { widgets: { new_leads: [{ id: 1, name: 'Hind Senhaji', created_at: iso(-33) }, { id: 3, name: 'X', created_at: iso(-1) }] } },
  '/backoffice/leads/1/duplicates': {
    leads: [{ id: 9, name: 'Hind Senhaji', status: 'new', created_at: iso(-9), property_title: 'Villa Rabat' }],
    clients: [],
  },
}
let listPayload

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })) } }))

function renderLeads() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><Leads /></MemoryRouter></QueryClientProvider>)
}

describe('Page Leads du back-office', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    listPayload = { leads: LEADS, total: 2, pages: 1, current_page: 1 }
    api.get.mockImplementation(async (url) => ({ data: url.startsWith('/backoffice/leads?') ? listPayload : ROUTES[url] }))
    await i18n.changeLanguage('fr')
  })

  it('affiche le titre en FR puis en AR', async () => {
    const { unmount } = renderLeads()
    expect(await screen.findByRole('heading', { level: 1, name: 'Leads' })).toBeInTheDocument()
    unmount()
    await i18n.changeLanguage('ar')
    renderLeads()
    expect(await screen.findByRole('heading', { level: 1, name: 'العملاء المحتملون' })).toBeInTheDocument()
  })

  it('résume les leads à traiter et le taux de conversion', async () => {
    renderLeads()
    const pending = (await screen.findByRole('heading', { name: 'Leads à traiter' })).closest('section')
    expect(within(pending).getByText('Le plus ancien attend depuis 33 jours.')).toBeInTheDocument()
    const conv = screen.getByRole('heading', { name: 'Conversion' }).closest('section')
    expect(await within(conv).findByText('5 leads sur 32 devenus clients')).toBeInTheDocument()
  })

  it('déplie la fiche : message, historique, doublons ; Échap la replie', async () => {
    const user = userEvent.setup()
    renderLeads()
    await screen.findByText('Hind Senhaji')
    await user.click(screen.getAllByRole('button', { name: 'Déplier la fiche' })[0])
    const fiche = within(document.getElementById('lead-fiche-1'))
    expect(fiche.getByText('Toujours disponible ?')).toBeInTheDocument()
    expect(screen.getByText('Historique du statut')).toBeInTheDocument()
    expect(await screen.findByText('1 autre demande de ce contact : traitez-les ensemble.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Historique du statut')).not.toBeInTheDocument()
  })

  it('fait avancer le statut après confirmation et n\'offre aucune action sur un lead converti', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderLeads()
    await screen.findByText('Hind Senhaji')
    expect(screen.getAllByRole('button', { name: 'Marquer comme contacté' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Marquer comme contacté' }))
    expect(api.put).toHaveBeenCalledWith('/backoffice/leads/1', { status: 'contacted' })
  })

  it('filtre les leads non attribués', async () => {
    const user = userEvent.setup()
    renderLeads()
    await screen.findByText('Hind Senhaji')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agent attribué' }), 'none')
    expect(api.get).toHaveBeenLastCalledWith(expect.stringContaining('assigned_to=none'))
  })

  it('affiche l\'état vide', async () => {
    listPayload = { leads: [], total: 0, pages: 0, current_page: 1 }
    renderLeads()
    expect(await screen.findByText('Aucun lead trouvé')).toBeInTheDocument()
  })
})
