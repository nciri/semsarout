import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import StaysLayout from './StaysLayout'
import StaysList from './StaysList'
import CalendarsList from './CalendarsList'
import MessagesPanel from './MessagesPanel'

const { svc } = vi.hoisted(() => ({
  svc: {
    overview: vi.fn(), listStays: vi.fn(), listSources: vi.fn(),
    addSource: vi.fn(), syncSource: vi.fn(), deleteSource: vi.fn(), syncAll: vi.fn(),
    updateContact: vi.fn(), listTemplates: vi.fn(), createTemplate: vi.fn(),
    updateTemplate: vi.fn(), deleteTemplate: vi.fn(), listMessages: vi.fn(),
  },
}))
vi.mock('../../../services/stayService', async (orig) => ({ ...(await orig()), stayService: svc }))
vi.mock('../../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { properties: [] } }) } }))

const OVERVIEW = {
  arrivals_today: 2, departures_today: 1, in_house: 4, upcoming: 7,
  conflicts: 1, nights_booked: 23, sources: { total: 3, in_error: 1 },
}
const STAYS = {
  conflicts: 1,
  stays: [
    { id: 1, property_id: 5, property_title: 'Riad Médina', platform: 'airbnb', source: 'ical', external_id: 'HMABC', guest_name: null, guest_phone: '****1234', guest_count: 2, check_in: '2026-11-02T00:00:00', check_out: '2026-11-05T00:00:00', nights: 3, status: 'confirmed', has_conflict: true },
    { id: 2, property_id: 5, property_title: 'Riad Médina', platform: 'booking', source: 'ical', external_id: null, guest_name: 'Salma Bennani', guest_phone: null, guest_count: 3, check_in: '2026-11-03T00:00:00', check_out: '2026-11-06T00:00:00', nights: 3, status: 'confirmed', has_conflict: true },
  ],
}
const SOURCES = {
  sources: [
    { id: 11, property_id: 5, property_title: 'Riad Médina', platform: 'airbnb', ical_url: 'https://x/a.ics', status: 'ok', last_error: null, last_synced_at: '2026-10-28T08:00:00', reservations_count: 4 },
    { id: 12, property_id: 5, property_title: 'Riad Médina', platform: 'booking', ical_url: 'https://x/b.ics', status: 'error', last_error: 'Réponse 404 de la plateforme.', last_synced_at: null, reservations_count: 0 },
  ],
}

const TEMPLATES = {
  placeholders: ['guest_name', 'property_title', 'check_in'],
  triggers: ['on_booking', 'before_check_in', 'after_check_out'],
  templates: [
    { id: 21, property_id: null, name: "Veille d'arrivée", trigger: 'before_check_in', offset_hours: 24, subject: 'Votre arrivée', body: 'Bonjour {{guest_name}}', active: true },
    { id: 22, property_id: 5, name: 'Merci', trigger: 'after_check_out', offset_hours: 12, subject: 'Merci de votre visite', body: 'Au revoir', active: true },
  ],
}
const JOURNAL = {
  pending: 1, no_recipient: 1,
  messages: [
    { id: 31, reservation_id: 1, template_id: 21, property_title: 'Riad Médina', guest_name: null, recipient: null, subject: 'Votre arrivée', status: 'no_recipient', error: null, due_at: '2026-11-01T09:00:00', sent_at: null },
    { id: 32, reservation_id: 2, template_id: 21, property_title: 'Riad Médina', guest_name: 'Salma Bennani', recipient: 'salma@example.com', subject: 'Votre arrivée', status: 'sent', error: null, due_at: '2026-11-02T09:00:00', sent_at: '2026-11-02T09:01:00' },
  ],
}

function renderAt(path) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/backoffice/sejours" element={<StaysLayout />}>
            <Route index element={<StaysList />} />
            <Route path="messages" element={<MessagesPanel />} />
          <Route path="calendriers" element={<CalendarsList />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Séjours courte durée', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset())
    svc.overview.mockResolvedValue(OVERVIEW)
    svc.listStays.mockResolvedValue(STAYS)
    svc.listSources.mockResolvedValue(SOURCES)
    svc.syncSource.mockResolvedValue({ sync: { created: 1, cancelled: 0 } })
    svc.syncAll.mockResolvedValue({ sources: 3, ok: 2, failed: 1 })
    svc.updateContact.mockResolvedValue({ stay: {} })
    svc.listTemplates.mockResolvedValue(TEMPLATES)
    svc.listMessages.mockResolvedValue(JOURNAL)
    svc.createTemplate.mockResolvedValue({ template: { id: 9 } })
  })

  it("résume la journée et alerte sur les doubles réservations", async () => {
    renderAt('/backoffice/sejours')
    expect(await screen.findByText('Séjours courte durée')).toBeInTheDocument()
    expect(screen.getByText('Arrivées du jour')).toBeInTheDocument()
    expect(await screen.findByText(/1 séjour en double réservation/)).toBeInTheDocument()
    expect(screen.getByText(/1 calendrier ne répond plus/)).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/backoffice/sejours')
    expect(await screen.findByText('الإقامات القصيرة')).toBeInTheDocument()
  })

  it('liste les séjours, signale le conflit et le nom non publié', async () => {
    renderAt('/backoffice/sejours')
    expect(await screen.findByText('Salma Bennani')).toBeInTheDocument()
    expect(screen.getByText('Nom non publié')).toBeInTheDocument()
    expect(screen.getAllByText('Double réservation')).toHaveLength(2)
    expect(svc.listStays).toHaveBeenCalledWith({ status: 'confirmed' })
  })

  it('filtre les séjours par statut', async () => {
    renderAt('/backoffice/sejours')
    await screen.findByText('Salma Bennani')
    await userEvent.selectOptions(screen.getByLabelText('Statut'), '')
    await vi.waitFor(() => expect(svc.listStays).toHaveBeenCalledWith({}))
  })

  it("montre l'état des calendriers et relance la synchro", async () => {
    renderAt('/backoffice/sejours/calendriers')
    expect(await screen.findByText('À jour')).toBeInTheDocument()
    expect(screen.getByText('Réponse 404 de la plateforme.')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Synchroniser' })[0])
    await vi.waitFor(() => expect(svc.syncSource).toHaveBeenCalledWith(11))
  })

  it("exige un bien et une URL avant d'ajouter un calendrier", async () => {
    renderAt('/backoffice/sejours/calendriers')
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un calendrier' }))
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
  })
})

describe('Messagerie de séjour', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset())
    svc.overview.mockResolvedValue(OVERVIEW)
    svc.listTemplates.mockResolvedValue(TEMPLATES)
    svc.listMessages.mockResolvedValue(JOURNAL)
    svc.createTemplate.mockResolvedValue({ template: { id: 9 } })
    svc.updateContact.mockResolvedValue({ stay: {} })
    svc.listStays.mockResolvedValue(STAYS)
  })

  it("liste les modèles avec leur moment d'envoi et le journal", async () => {
    renderAt('/backoffice/sejours/messages')
    expect(await screen.findByText("24 h avant l'arrivée")).toBeInTheDocument()
    expect(screen.getByText('12 h après le départ')).toBeInTheDocument()
    expect(screen.getByText('Tous les biens')).toBeInTheDocument()
    expect(screen.getAllByText('Email manquant')).toHaveLength(2)   // destinataire + statut
    expect(screen.getByText('Envoyé')).toBeInTheDocument()
  })

  it('cache le délai pour un déclencheur immédiat', async () => {
    renderAt('/backoffice/sejours/messages')
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un modèle' }))
    expect(screen.getByLabelText('Délai en heures')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Déclencheur'), 'on_booking')
    expect(screen.queryByLabelText('Délai en heures')).not.toBeInTheDocument()
  })

  it('envoie le modèle saisi au service', async () => {
    renderAt('/backoffice/sejours/messages')
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un modèle' }))
    await userEvent.type(screen.getByLabelText('Nom interne'), 'Bienvenue')
    await userEvent.type(screen.getByLabelText("Objet de l'email"), 'Votre séjour')
    await userEvent.type(screen.getByLabelText('Message'), 'Bonjour')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(svc.createTemplate).toHaveBeenCalledWith({
      name: 'Bienvenue', trigger: 'before_check_in', subject: 'Votre séjour',
      body: 'Bonjour', offset_hours: 24, property_id: null,
    }))
  })

  it('complète le contact du voyageur depuis le planning', async () => {
    renderAt('/backoffice/sejours')
    await screen.findByText('Salma Bennani')
    await userEvent.click(screen.getAllByRole('button', { name: 'Compléter le contact du voyageur' })[0])
    await userEvent.type(screen.getByLabelText('Email'), 'voyageur@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(svc.updateContact).toHaveBeenCalledWith(1, {
      guest_name: '', guest_email: 'voyageur@example.com', guest_phone: '****1234',
    }))
  })
})
