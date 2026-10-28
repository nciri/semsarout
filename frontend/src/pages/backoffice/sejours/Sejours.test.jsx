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
import CleaningPanel from './CleaningPanel'
import AccessPanel from './AccessPanel'

const { svc } = vi.hoisted(() => ({
  svc: {
    overview: vi.fn(), listStays: vi.fn(), listSources: vi.fn(),
    addSource: vi.fn(), syncSource: vi.fn(), deleteSource: vi.fn(), syncAll: vi.fn(),
    updateContact: vi.fn(), listTemplates: vi.fn(), createTemplate: vi.fn(),
    updateTemplate: vi.fn(), deleteTemplate: vi.fn(), listMessages: vi.fn(),
    listCleanings: vi.fn(), getCleaning: vi.fn(), createCleaning: vi.fn(),
    updateCleaning: vi.fn(), addReport: vi.fn(), markReportSeen: vi.fn(),
    addReportPhoto: vi.fn(), photoUrl: (id) => `/photo/${id}`,
    createCheckinLink: vi.fn(), getCheckin: vi.fn(), reviewGuest: vi.fn(),
    guestDocUrl: (id) => `/piece/${id}`,
    listAccess: vi.fn(), setAccess: vi.fn(), getCode: vi.fn(), issueCode: vi.fn(), revokeCode: vi.fn(),
  },
}))
vi.mock('../../../services/stayService', async (orig) => ({ ...(await orig()), stayService: svc }))
vi.mock('../../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { properties: [] } }) } }))
vi.mock('../../../services/teamService', () => ({
  teamService: { getTeam: vi.fn().mockResolvedValue({ members: [{ id: 7, full_name: 'Rachid Alami' }] }) },
}))

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
            <Route path="menage" element={<CleaningPanel />} />
          <Route path="acces" element={<AccessPanel />} />
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
    Object.values(svc).forEach((m) => m.mockReset?.())
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
    Object.values(svc).forEach((m) => m.mockReset?.())
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

const CLEANINGS = {
  late: 1, urgent_reports: 1, zones: ['chambres', 'cuisine'],
  tasks: [
    { id: 51, property_id: 5, property_title: 'Riad Médina', reservation_id: 1, guest_name: 'Salma Bennani', next_check_in: '2026-11-07T15:00:00', assigned_to_id: null, scheduled_date: '2026-11-05', status: 'pending', zones_done: [], notes: null, started_at: null, completed_at: null, reports_count: 1, urgent_count: 1 },
    { id: 52, property_id: 5, property_title: 'Riad Médina', reservation_id: 2, guest_name: null, next_check_in: null, assigned_to_id: 7, scheduled_date: '2026-11-08', status: 'in_progress', zones_done: ['cuisine'], notes: null, started_at: '2026-11-08T09:00:00', completed_at: null, reports_count: 0, urgent_count: 0 },
  ],
}
const CLEANING_DETAIL = {
  task: {
    ...CLEANINGS.tasks[0],
    reports: [
      { id: 61, task_id: 51, kind: 'issue', category: 'plomberie', text_note: "Fuite sous l'évier", is_urgent: true, seen_at: null, author_user_id: 7, created_at: '2026-11-05T11:00:00', photos: [{ id: 71, filename: 'fuite.jpg' }] },
    ],
  },
}

describe('Ménage de rotation', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset?.())
    svc.overview.mockResolvedValue(OVERVIEW)
    svc.listCleanings.mockResolvedValue(CLEANINGS)
    svc.getCleaning.mockResolvedValue(CLEANING_DETAIL)
    svc.updateCleaning.mockResolvedValue({ task: CLEANING_DETAIL.task })
    svc.addReport.mockResolvedValue({ report: { id: 62 } })
    svc.addReportPhoto.mockResolvedValue({ photo: { id: 72 } })
    svc.markReportSeen.mockResolvedValue({ report: {} })
    svc.createCleaning.mockResolvedValue({ task: { id: 53 } })
  })

  it('liste le planning du ménage, les retards et les urgences', async () => {
    renderAt('/backoffice/sejours/menage')
    expect(await screen.findByText('1 ménage en retard.')).toBeInTheDocument()
    expect(screen.getByText('1 signalement urgent non lu.')).toBeInTheDocument()
    expect(screen.getByText('1 urgent')).toBeInTheDocument()
    expect(screen.getAllByText('En cours').length).toBeGreaterThan(0)   // filtre + pastille
  })

  it('démarre puis termine un ménage', async () => {
    renderAt('/backoffice/sejours/menage')
    await userEvent.click(await screen.findByRole('button', { name: 'Démarrer le ménage' }))
    await vi.waitFor(() => expect(svc.updateCleaning).toHaveBeenCalledWith(51, { status: 'in_progress' }))
    await userEvent.click(screen.getByRole('button', { name: 'Terminer le ménage' }))
    await vi.waitFor(() => expect(svc.updateCleaning).toHaveBeenCalledWith(52, { status: 'done' }))
  })

  it('attribue le ménage à un membre de l\'équipe', async () => {
    renderAt('/backoffice/sejours/menage')
    const selects = await screen.findAllByLabelText('Intervenant')
    await userEvent.selectOptions(selects[0], '7')
    await vi.waitFor(() => expect(svc.updateCleaning).toHaveBeenCalledWith(51, { assigned_to_id: '7' }))
  })

  it('coche une zone depuis le détail', async () => {
    renderAt('/backoffice/sejours/menage')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Ouvrir le détail' }))[0])
    await userEvent.click(await screen.findByLabelText('Cuisine'))
    await vi.waitFor(() => expect(svc.updateCleaning).toHaveBeenCalledWith(51, { zones_done: ['cuisine'] }))
  })

  it('montre le signalement urgent, sa photo, et le marque lu', async () => {
    renderAt('/backoffice/sejours/menage')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Ouvrir le détail' }))[0])
    expect(await screen.findByText("Fuite sous l'évier")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'fuite.jpg' })).toHaveAttribute('href', '/photo/71')
    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme lu' }))
    await vi.waitFor(() => expect(svc.markReportSeen).toHaveBeenCalledWith(61))
  })

  it('exige une description avant d\'envoyer un signalement', async () => {
    renderAt('/backoffice/sejours/menage')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Ouvrir le détail' }))[0])
    const submit = await screen.findByRole('button', { name: 'Envoyer le signalement' })
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Description'), 'Serviettes manquantes')
    await userEvent.click(submit)
    await vi.waitFor(() => expect(svc.addReport).toHaveBeenCalledWith(51, {
      kind: 'issue', category: '', text_note: 'Serviettes manquantes', is_urgent: false,
    }))
  })
})

const CHECKIN = {
  declared: 2, expected: 3, document_types: ['cin', 'passeport'],
  link: { id: 81, reservation_id: 1, status: 'sent', expires_at: '2026-11-09T00:00:00', submitted_at: null },
  guests: [
    { id: 91, full_name: 'Salma Bennani', is_lead: true, birth_date: '1992-04-18', nationality: 'Maroc', document_type: 'cin', document_number: 'AB12345', status: 'declared', review_note: null, documents: [{ id: 95, filename: 'cin.jpg' }] },
    { id: 92, full_name: 'Youssef Bennani', is_lead: false, birth_date: null, nationality: null, document_type: null, document_number: null, status: 'declared', review_note: null, documents: [] },
  ],
}

describe("Dossier d'enregistrement (agence)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset?.())
    svc.overview.mockResolvedValue(OVERVIEW)
    svc.listStays.mockResolvedValue(STAYS)
    svc.getCheckin.mockResolvedValue(CHECKIN)
    svc.getCode.mockResolvedValue({ code: null, mode: 'manual', instructions: 'Boîte à clés' })
    svc.issueCode.mockResolvedValue({ code: { code: '4821' } })
    svc.revokeCode.mockResolvedValue({ code: { status: 'revoked' } })
    svc.createCheckinLink.mockResolvedValue({ link: { ...CHECKIN.link, token: 'jeton-prive' } })
    svc.reviewGuest.mockResolvedValue({ guest: {} })
  })

  it('montre les occupants déclarés et la pièce manquante', async () => {
    renderAt('/backoffice/sejours')
    await screen.findByText('Salma Bennani')
    await userEvent.click((await screen.findAllByRole('button', { name: "Dossier d'enregistrement" }))[0])
    expect(await screen.findByText('Occupants déclarés : 2 sur 3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'cin.jpg' })).toHaveAttribute('href', '/piece/95')
    expect(screen.getByText("Pièce d'identité manquante.")).toBeInTheDocument()
  })

  it("affiche le lien une seule fois, à sa création", async () => {
    renderAt('/backoffice/sejours')
    await screen.findByText('Salma Bennani')
    await userEvent.click((await screen.findAllByRole('button', { name: "Dossier d'enregistrement" }))[0])
    expect(screen.queryByText(/jeton-prive/)).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Renouveler le lien' }))
    expect(await screen.findByText(/sejour\/enregistrement\/jeton-prive/)).toBeInTheDocument()
  })

  it('rend un verdict sur un occupant', async () => {
    renderAt('/backoffice/sejours')
    await screen.findByText('Salma Bennani')
    await userEvent.click((await screen.findAllByRole('button', { name: "Dossier d'enregistrement" }))[0])
    await userEvent.click((await screen.findAllByRole('button', { name: "Valider l'occupant" }))[0])
    await vi.waitFor(() => expect(svc.reviewGuest).toHaveBeenCalledWith(91, { status: 'validated' }))
  })
})

const ACCESS = {
  modes: ['traditional', 'manual', 'ttlock'],
  access: [
    { property_id: 5, property_title: 'Riad Médina', mode: 'manual', instructions: 'Boîte à clés à droite', configured: false, updated_at: '2026-10-28T08:00:00' },
    { property_id: 6, property_title: 'Appartement Gauthier', mode: 'ttlock', instructions: null, configured: true, updated_at: '2026-10-28T08:00:00' },
  ],
}

describe("Modes d'entrée et codes", () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset?.())
    svc.overview.mockResolvedValue(OVERVIEW)
    svc.listStays.mockResolvedValue(STAYS)
    svc.listAccess.mockResolvedValue(ACCESS)
    svc.setAccess.mockResolvedValue({ access: ACCESS.access[0] })
    svc.getCheckin.mockResolvedValue(CHECKIN)
    svc.getCode.mockResolvedValue({ code: null, mode: 'manual', instructions: 'Boîte à clés' })
    svc.issueCode.mockResolvedValue({ code: { code: '4821' } })
    svc.revokeCode.mockResolvedValue({ code: { status: 'revoked' } })
  })

  it("liste les modes d'entrée configurés", async () => {
    renderAt('/backoffice/sejours/acces')
    expect(await screen.findByText("Code posé par l'agence")).toBeInTheDocument()
    expect(screen.getByText('Serrure connectée TTLock')).toBeInTheDocument()
    expect(screen.getByText('Identifiants posés')).toBeInTheDocument()
  })

  it("ne demande les identifiants TTLock qu'en mode serrure", async () => {
    renderAt('/backoffice/sejours/acces')
    await userEvent.click(await screen.findByRole('button', { name: 'Configurer un bien' }))
    expect(screen.queryByLabelText('Clé secrète TTLock')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText("Mode d'entrée"), 'ttlock')
    expect(screen.getByLabelText('Clé secrète TTLock')).toBeInTheDocument()
  })

  it("pose un code manuel depuis le dossier du séjour", async () => {
    renderAt('/backoffice/sejours')
    await screen.findByText('Salma Bennani')
    await userEvent.click((await screen.findAllByRole('button', { name: "Dossier d'enregistrement" }))[0])
    await userEvent.type(await screen.findByLabelText('Code à communiquer'), '4821')
    await userEvent.click(screen.getByRole('button', { name: 'Poser le code' }))
    await vi.waitFor(() => expect(svc.issueCode).toHaveBeenCalledWith(1, { code: '4821' }))
  })

  it("révoque le code actif", async () => {
    svc.getCode.mockResolvedValue({
      code: { id: 1, code: '4821', mode: 'manual', valid_until: '2026-11-08T14:00:00', status: 'active' },
      mode: 'manual', instructions: null,
    })
    renderAt('/backoffice/sejours')
    await screen.findByText('Salma Bennani')
    await userEvent.click((await screen.findAllByRole('button', { name: "Dossier d'enregistrement" }))[0])
    expect(await screen.findByText('4821')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Révoquer le code' }))
    await vi.waitFor(() => expect(svc.revokeCode).toHaveBeenCalledWith(1))
  })
})
