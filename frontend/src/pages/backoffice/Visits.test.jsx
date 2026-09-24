import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import Visits from './Visits'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const past = {
  id: 7, scheduled_at: '2026-07-30T09:30:00', status: 'confirmed', contact_name: 'Karim Alaoui',
  property_title: 'Appartement Maârif', property_id: 3, client_id: 11, agent_name: 'Sara Idrissi',
  contact_phone: '0612345678', report: 'Visite rapide, cuisine à refaire', client_feedback: 'interested',
  duration_minutes: 30, confirmed_at: '2026-07-29T10:00:00',
}
const SUMMARY = {
  upcoming: 0, to_confirm: 0, next: null, overdue: [past], overdue_total: 1,
  recent: { days: 90, completed: 3, cancelled: 1, no_show: 0, unresolved: 1, total: 5 },
}

function renderAt(path = '/backoffice/visites') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><Visits /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  vi.clearAllMocks()
  api.get.mockImplementation(async (url) => ({
    data: url.endsWith('/summary') ? SUMMARY : url.startsWith('/backoffice/visits') ? { visits: [], total: 0, pages: 0 } : {},
  }))
  api.put.mockResolvedValue({ data: {} })
})

describe('Visites & RDV', () => {
  it('résume l’agenda et met en évidence les visites à requalifier', async () => {
    renderAt()
    expect(await screen.findByText('Visites & RDV')).toBeInTheDocument()
    expect(await screen.findByText('1 visite passée n\'a pas été requalifiée.')).toBeInTheDocument()
    expect(screen.getByText('75')).toBeInTheDocument() // 3 honorées sur 4 requalifiées
    expect(screen.getAllByText('À requalifier').length).toBeGreaterThan(0)
  })

  it('requalifie une visite passée en un clic (client absent)', async () => {
    renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Client absent' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/backoffice/visits/7', { status: 'no_show' }))
  })

  it('déplie la fiche : bien, contact, agent, compte rendu, retour client', async () => {
    renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Voir la fiche' }))
    const fiche = document.getElementById('visit-fiche-7')
    expect(within(fiche).getByText('Visite rapide, cuisine à refaire')).toBeInTheDocument()
    expect(within(fiche).getByText('Intéressé')).toBeInTheDocument()
    expect(within(fiche).getByRole('link', { name: 'Ouvrir la fiche client' })).toHaveAttribute('href', '/backoffice/clients/11')
    fireEvent.click(within(fiche).getByRole('button', { name: 'Marquer honorée et rédiger le compte rendu' }))
    fireEvent.click(within(fiche).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/backoffice/visits/7', expect.objectContaining({ status: 'completed', report: 'Visite rapide, cuisine à refaire' })))
  })

  it('ouvre le formulaire de création sur /visites/nouvelle', async () => {
    renderAt('/backoffice/visites/nouvelle')
    expect(await screen.findByRole('dialog', { name: 'Planifier une visite' })).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderAt()
    expect(await screen.findByText('الزيارات والمواعيد')).toBeInTheDocument()
    expect(await screen.findByText('زيارة سابقة لم تُحدَّث حالتها.', { exact: false })).toBeInTheDocument()
  })

  // Le bouton d'ajout porte son libellé (et non une simple icône), et le réglage des créneaux
  // de l'agent est à portée de main depuis l'agenda.
  it('affiche « Planifier une visite » en toutes lettres et un accès aux disponibilités', async () => {
    renderAt()
    expect(await screen.findByRole('button', { name: 'Planifier une visite' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Définir mes disponibilités' }))
      .toHaveAttribute('href', '/backoffice/visites/disponibilites')
  })
})
