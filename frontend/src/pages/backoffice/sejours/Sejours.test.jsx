import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import api from '../../../services/api'
import StaysLayout from './StaysLayout'
import StaysList from './StaysList'
import CalendarsList from './CalendarsList'
import MessagesPanel from './MessagesPanel'
import CleaningPanel from './CleaningPanel'
import AccessPanel from './AccessPanel'
import StayCalendar from './StayCalendar'
import StayDetail from './StayDetail'
import OpsTeamsPanel from './OpsTeamsPanel'

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
    getStay: vi.fn(), createStay: vi.fn(), updateStay: vi.fn(), cancelStay: vi.fn(), calendar: vi.fn(),
    listOpsTeams: vi.fn(), assignTeam: vi.fn(), getContract: vi.fn(), createContract: vi.fn(),
  },
}))
vi.mock('../../../services/stayService', async (orig) => ({ ...(await orig()), stayService: svc }))
vi.mock('../../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { properties: [] } }) } }))
vi.mock('../../../services/teamService', () => ({
  teamService: { getTeam: vi.fn().mockResolvedValue({ members: [{ id: 7, full_name: 'Rachid Alami' }] }) },
}))

const OVERVIEW = {
  stays_total: 11, arrivals_today: 2, departures_today: 1, in_house: 4, upcoming: 7,
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

const DETAIL = {
  stay: {
    id: 2, property_id: 5, property_title: 'Riad Médina', platform: 'booking', source: 'manual',
    external_id: null, guest_name: 'Salma Bennani', guest_email: 'salma@example.com',
    guest_phone: '0600000000', guest_count: 3, check_in: '2026-11-03T00:00:00',
    check_out: '2026-11-06T00:00:00', nights: 3, status: 'confirmed', has_conflict: false,
    total_price: 3200, cleaning_fee: 300, currency: 'Dh', editable: true,
    guest_notes: 'Arrivée tardive', special_requests: null, contract_status: null,
  },
  guests: [{ id: 8, full_name: 'Salma Bennani', is_lead: true, status: 'validated', document_type: 'cin', nationality: 'Maroc' }],
  checkin: { status: 'submitted', expires_at: '2026-11-07T00:00:00', submitted_at: '2026-11-01T10:00:00' },
  cleaning: { id: 44, status: 'pending', scheduled_date: '2026-11-06', assigned_to_id: 7 },
  access_code: { id: 3, mode: 'manual', code: '4821', valid_from: '2026-11-03T11:00:00', valid_until: '2026-11-06T14:00:00' },
  messages: [{ id: 32, subject: 'Votre arrivée', status: 'sent', due_at: '2026-11-02T09:00:00', sent_at: '2026-11-02T09:01:00' }],
  conflicts: [],
}
const OPS_TEAMS = {
  performance_days: 30,
  teams: [{ id: 3, name: 'Ménage Gueliz', kind: 'menage', color: '#1E7F4E', members_count: 2,
    performance: { planned: 5, done: 4, late: 1, urgent_reports: 2, avg_minutes: 75 } }],
  properties: [{ property_id: 5, property_title: 'Riad Médina', team_id: null }],
}
const CALENDAR = {
  month: '2026-11', days: 30,
  properties: [{ property_id: 5, property_title: 'Riad Médina', stays: [
    { id: 2, guest_name: 'Salma Bennani', platform: 'booking', nights: 3, status: 'confirmed',
      has_conflict: false, check_in: '2026-11-03T00:00:00', check_out: '2026-11-06T00:00:00' },
  ] }],
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
          <Route path="calendrier" element={<StayCalendar />} />
          <Route path="equipes" element={<OpsTeamsPanel />} />
          </Route>
          <Route path="/backoffice/sejours/:stayId" element={<StayDetail />} />
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
    svc.getStay.mockResolvedValue(DETAIL)
    svc.calendar.mockResolvedValue(CALENDAR)
    svc.createStay.mockResolvedValue({ stay: { id: 3 } })
    svc.cancelStay.mockResolvedValue({ stay: { id: 2, status: 'cancelled' }, code_warnings: [] })
    svc.listOpsTeams.mockResolvedValue(OPS_TEAMS)
    svc.getContract.mockResolvedValue({ contract: null })
    svc.createContract.mockResolvedValue({ contract: { id: 55, status: 'finalized' } })
    svc.assignTeam.mockResolvedValue({ property_id: 5, team_id: 3 })
    api.get.mockResolvedValue({ data: { properties: [{ id: 5, title: 'Riad Médina' }] } })
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

  it("exige un bien et une URL avant de connecter des calendriers", async () => {
    renderAt('/backoffice/sejours/calendriers')
    await userEvent.click(await screen.findByRole('button', { name: 'Connecter des calendriers' }))
    expect(screen.getByRole('button', { name: 'Connecter' })).toBeDisabled()
  })

  it('branche plusieurs plateformes en un seul envoi', async () => {
    svc.addSource.mockResolvedValue({ source: { id: 13 }, sync: { created: 2 } })
    renderAt('/backoffice/sejours/calendriers')
    await userEvent.click(await screen.findByRole('button', { name: 'Connecter des calendriers' }))
    await userEvent.selectOptions(screen.getByLabelText('Bien'), '5')
    await userEvent.type(screen.getByLabelText('URL du calendrier iCal — VRBO'), 'https://vrbo/x.ics')
    await userEvent.type(screen.getByLabelText('URL du calendrier iCal — Autre'), 'https://autre/y.ics')
    await userEvent.click(screen.getByRole('button', { name: 'Connecter' }))
    await vi.waitFor(() => expect(svc.addSource).toHaveBeenCalledTimes(2))
    expect(svc.addSource).toHaveBeenCalledWith({ property_id: 5, platform: 'vrbo', ical_url: 'https://vrbo/x.ics' })
    expect(svc.addSource).toHaveBeenCalledWith({ property_id: 5, platform: 'autre', ical_url: 'https://autre/y.ics' })
  })

  it('ferme les plateformes déjà branchées sur le bien choisi', async () => {
    renderAt('/backoffice/sejours/calendriers')
    await userEvent.click(await screen.findByRole('button', { name: 'Connecter des calendriers' }))
    await userEvent.selectOptions(screen.getByLabelText('Bien'), '5')
    // Le service refuse un second calendrier pour le même couple : le champ le dit avant l'envoi.
    expect(screen.getByLabelText('URL du calendrier iCal — Airbnb')).toBeDisabled()
    expect(screen.getByLabelText('URL du calendrier iCal — VRBO')).toBeEnabled()
  })

  it("garde l'URL fautive quand une seule plateforme échoue", async () => {
    svc.addSource
      .mockResolvedValueOnce({ source: { id: 13 }, sync: { created: 1 } })
      .mockRejectedValueOnce({ response: { data: { error: 'Calendrier illisible.' } } })
    renderAt('/backoffice/sejours/calendriers')
    await userEvent.click(await screen.findByRole('button', { name: 'Connecter des calendriers' }))
    await userEvent.selectOptions(screen.getByLabelText('Bien'), '5')
    await userEvent.type(screen.getByLabelText('URL du calendrier iCal — VRBO'), 'https://vrbo/x.ics')
    await userEvent.type(screen.getByLabelText('URL du calendrier iCal — Autre'), 'https://autre/y.ics')
    await userEvent.click(screen.getByRole('button', { name: 'Connecter' }))
    expect(await screen.findByText('Calendrier illisible.')).toBeInTheDocument()
    expect(screen.getByLabelText('URL du calendrier iCal — VRBO')).toHaveValue('')
    expect(screen.getByLabelText('URL du calendrier iCal — Autre')).toHaveValue('https://autre/y.ics')
  })

  it('range les rubriques par rôle au lieu de les aligner', async () => {
    renderAt('/backoffice/sejours')
    const nav = await screen.findByRole('navigation', { name: 'Rubriques des séjours' })
    expect(within(nav).getByRole('heading', { name: 'Réservations' })).toBeInTheDocument()
    expect(within(nav).getByRole('heading', { name: 'Exploitation' })).toBeInTheDocument()
    expect(within(nav).getByRole('heading', { name: 'Réglages par bien' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: "Tâches d'exploitation" })).toBeInTheDocument()
    // Les calendriers quittent la colonne : ils alimentent les séjours, ils n'en sont pas une vue.
    expect(within(nav).queryByText('Calendriers')).not.toBeInTheDocument()
  })

  it("ouvre les calendriers depuis l'en-tête, à côté de la synchronisation", async () => {
    renderAt('/backoffice/sejours')
    const lien = await screen.findByRole('link', { name: 'Calendriers connectés' })
    expect(lien).toHaveAttribute('href', '/backoffice/sejours/calendriers')
    await userEvent.click(lien)
    expect(await screen.findByText('Revenir au planning des séjours')).toBeInTheDocument()
  })

  it("éteint l'exploitation tant qu'aucun séjour n'est enregistré", async () => {
    svc.overview.mockResolvedValue({ ...OVERVIEW, stays_total: 0, conflicts: 0 })
    renderAt('/backoffice/sejours')
    const nav = await screen.findByRole('navigation', { name: 'Rubriques des séjours' })
    await vi.waitFor(() => expect(within(nav).queryByRole('link', { name: "Tâches d'exploitation" })).not.toBeInTheDocument())
    expect(within(nav).getByText("Tâches d'exploitation")).toHaveAttribute('aria-disabled', 'true')
    expect(within(nav).getByText(/Rien à traiter tant qu'aucun séjour/)).toBeInTheDocument()
    // Les interventions de Tiers ne dépendent pas des séjours : la maintenance reste ouverte.
    expect(within(nav).getByRole('link', { name: 'Maintenance' })).toBeInTheDocument()
    // Les réglages par bien restent ouverts : ce sont eux qui font venir les séjours.
    expect(within(nav).getByRole('link', { name: 'Accès' })).toBeInTheDocument()
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
    svc.getStay.mockResolvedValue(DETAIL)
    svc.calendar.mockResolvedValue(CALENDAR)
    svc.createStay.mockResolvedValue({ stay: { id: 3 } })
    svc.cancelStay.mockResolvedValue({ stay: { id: 2, status: 'cancelled' }, code_warnings: [] })
    svc.listOpsTeams.mockResolvedValue(OPS_TEAMS)
    svc.getContract.mockResolvedValue({ contract: null })
    svc.createContract.mockResolvedValue({ contract: { id: 55, status: 'finalized' } })
    svc.assignTeam.mockResolvedValue({ property_id: 5, team_id: 3 })
    api.get.mockResolvedValue({ data: { properties: [{ id: 5, title: 'Riad Médina' }] } })
    svc.updateContact.mockResolvedValue({ stay: {} })
    svc.listStays.mockResolvedValue(STAYS)
  })

  it("liste les modèles avec leur moment d'envoi et le journal", async () => {
    renderAt('/backoffice/sejours/messages')
    // Le même moment d'envoi figure aussi dans les modèles prêts à l'emploi : on lit le tableau.
    const table = (await screen.findAllByRole('table'))[0]
    expect(within(table).getByText("24 h avant l'arrivée")).toBeInTheDocument()
    expect(within(table).getByText('12 h après le départ')).toBeInTheDocument()
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

  it("installe un modèle prêt à l'emploi repris de StayManager", async () => {
    svc.createTemplate.mockResolvedValue({ template: { id: 9, name: 'Rappel de départ' } })
    renderAt('/backoffice/sejours/messages')
    const item = (await screen.findByText('Rappel de départ')).closest('li')
    expect(within(item).getByText('24 h avant le départ')).toBeInTheDocument()
    await userEvent.click(within(item).getByRole('button', { name: 'Ajouter ce modèle' }))
    await vi.waitFor(() => expect(svc.createTemplate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Rappel de départ', trigger: 'before_check_out', offset_hours: 24, property_id: null,
    })))
    // Le corps vient du modèle repris : il ne doit porter que des variables connues du service.
    const { body } = svc.createTemplate.mock.calls[0][0]
    expect(body).toContain('{{guest_name}}')
    expect(body).toContain('{{check_out}}')
    expect(body).not.toMatch(/\{\{(check_out_time|host_name|property_name)\}\}/)
  })

  // Le corps du message est saisi en WYSIWYG et part en HTML dans l'email du voyageur.
  it('envoie le corps du message en HTML et reprend les modèles préécrits en paragraphes', async () => {
    svc.createTemplate.mockResolvedValue({ template: { id: 9, name: 'Rappel de départ' } })
    renderAt('/backoffice/sejours/messages')
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un modèle' }))
    await userEvent.type(screen.getByLabelText('Nom interne'), 'Bienvenue')
    await userEvent.type(screen.getByLabelText("Objet de l'email"), 'Votre séjour')
    const corps = screen.getByLabelText('Message')
    corps.innerHTML = '<p class="MsoNormal">Bonjour <strong>{{guest_name}}</strong></p><script>alert(1)</script>'
    fireEvent.input(corps)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(svc.createTemplate).toHaveBeenCalledWith(expect.objectContaining({
      body: '<p>Bonjour <strong>{{guest_name}}</strong></p>',
    })))

    // Un modèle préécrit est rédigé en texte dans les locales : ses sauts de ligne doivent
    // devenir des paragraphes, sinon l'email les perdrait à l'affichage HTML.
    const item = (await screen.findByText('Rappel de départ')).closest('li')
    await userEvent.click(within(item).getByRole('button', { name: 'Ajouter ce modèle' }))
    const { body } = svc.createTemplate.mock.calls.at(-1)[0]
    expect(body.startsWith('<p>')).toBe(true)
    expect(body).toContain('</p><p>')
    expect(body).not.toContain('\n')
  })

  it("reprend en paragraphes un modèle enregistré avant la bascule WYSIWYG", async () => {
    renderAt('/backoffice/sejours/messages')
    const table = (await screen.findAllByRole('table'))[0]
    await userEvent.click(within(table).getAllByRole('button', { name: 'Modifier le modèle' })[0])
    // Le modèle 21 est stocké en texte brut : l'éditeur doit l'afficher comme un paragraphe.
    expect(screen.getByLabelText('Message').innerHTML).toBe('<p>Bonjour {{guest_name}}</p>')
  })

  it('ne repropose pas un modèle déjà installé', async () => {
    svc.listTemplates.mockResolvedValue({
      ...TEMPLATES,
      templates: [...TEMPLATES.templates, {
        id: 23, property_id: null, name: "Demande d'avis", trigger: 'after_check_out',
        offset_hours: 24, subject: 'Merci', body: 'Bonjour', active: true,
      }],
    })
    renderAt('/backoffice/sejours/messages')
    const item = (await screen.findAllByText("Demande d'avis"))[0].closest('li')
    expect(within(item).getByText('Déjà ajouté')).toBeInTheDocument()
    expect(within(item).queryByRole('button')).not.toBeInTheDocument()
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
    expect(await screen.findByText('1 tâche en retard.')).toBeInTheDocument()
    expect(screen.getByText('1 signalement urgent non lu.')).toBeInTheDocument()
    expect(screen.getByText('1 urgent')).toBeInTheDocument()
    expect(screen.getAllByText('En cours').length).toBeGreaterThan(0)   // filtre + pastille
  })

  it('filtre les tâches par type, toutes visibles par défaut', async () => {
    renderAt('/backoffice/sejours/menage')
    const type = await screen.findByLabelText('Type de tâche')
    expect(type).toHaveValue('')
    expect(svc.listCleanings).toHaveBeenLastCalledWith({})
    await userEvent.selectOptions(type, 'linge')
    await vi.waitFor(() => expect(svc.listCleanings)
      .toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'linge' })))
  })

  it('affiche le type de chaque tâche', async () => {
    svc.listCleanings.mockResolvedValue({ ...CLEANINGS,
      tasks: CLEANINGS.tasks.map((x, i) => ({ ...x, kind: i ? 'menage' : 'accueil' })) })
    renderAt('/backoffice/sejours/menage')
    expect(within(await screen.findByRole('table')).getByText('Accueil')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getAllByText('Ménage')).toHaveLength(1)
  })

  it('mène à la maintenance, qui vit dans les interventions de Tiers', async () => {
    renderAt('/backoffice/sejours')
    const nav = await screen.findByRole('navigation', { name: 'Rubriques des séjours' })
    expect(within(nav).getByRole('link', { name: 'Maintenance' }))
      .toHaveAttribute('href', '/backoffice/tiers/artisans')
  })

  async function fillNewTask() {
    api.get.mockResolvedValue({ data: { properties: [{ id: 5, title: 'Riad Médina' }] } })
    renderAt('/backoffice/sejours/menage')
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter une tâche' }))
    await userEvent.selectOptions(await screen.findByLabelText('Bien'), '5')
    fireEvent.change(screen.getByLabelText('Date prévue'), { target: { value: '2026-11-10' } })
  }

  it('crée une tâche de ménage par défaut', async () => {
    await fillNewTask()
    expect(screen.getByLabelText('Type')).toHaveValue('menage')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await vi.waitFor(() => expect(svc.createCleaning)
      .toHaveBeenCalledWith(expect.objectContaining({ kind: 'menage', property_id: 5 })))
  })

  it('envoie le type choisi à la création', async () => {
    await fillNewTask()
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'accueil')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await vi.waitFor(() => expect(svc.createCleaning)
      .toHaveBeenCalledWith(expect.objectContaining({ kind: 'accueil', property_id: 5 })))
  })

  it("rappelle le type de la tâche dans son détail", async () => {
    svc.getCleaning.mockResolvedValue({ task: { ...CLEANING_DETAIL.task, kind: 'linge' } })
    renderAt('/backoffice/sejours/menage')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Ouvrir le détail' }))[0])
    expect(await screen.findByText('Détail de la tâche')).toBeInTheDocument()
    expect((await screen.findByText('Type', { selector: 'span' })).nextElementSibling).toHaveTextContent('Linge')
  })

  it('démarre puis termine une tâche', async () => {
    renderAt('/backoffice/sejours/menage')
    await userEvent.click(await screen.findByRole('button', { name: 'Démarrer la tâche' }))
    await vi.waitFor(() => expect(svc.updateCleaning).toHaveBeenCalledWith(51, { status: 'in_progress' }))
    await userEvent.click(screen.getByRole('button', { name: 'Terminer la tâche' }))
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

describe('Fiche de séjour, saisie directe et calendrier', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.values(svc).forEach((m) => m.mockReset?.())
    svc.overview.mockResolvedValue(OVERVIEW)
    svc.listStays.mockResolvedValue(STAYS)
    svc.listSources.mockResolvedValue(SOURCES)
    svc.getStay.mockResolvedValue(DETAIL)
    svc.calendar.mockResolvedValue(CALENDAR)
    svc.createStay.mockResolvedValue({ stay: { id: 3 } })
    svc.cancelStay.mockResolvedValue({ stay: { id: 2, status: 'cancelled' }, code_warnings: [] })
    svc.listOpsTeams.mockResolvedValue(OPS_TEAMS)
    svc.getContract.mockResolvedValue({ contract: null })
    svc.createContract.mockResolvedValue({ contract: { id: 55, status: 'finalized' } })
    svc.assignTeam.mockResolvedValue({ property_id: 5, team_id: 3 })
    api.get.mockResolvedValue({ data: { properties: [{ id: 5, title: 'Riad Médina' }] } })
  })

  it("filtre le planning sur les arrivées du jour depuis l'aperçu", async () => {
    const today = new Date().toISOString().slice(0, 10)
    svc.listStays.mockResolvedValue({ conflicts: 0, stays: [
      { ...STAYS.stays[1], has_conflict: false, check_in: `${today}T00:00:00`, check_out: '2027-01-02T00:00:00' },
      { ...STAYS.stays[0], id: 9, has_conflict: false, guest_name: 'Karim Tazi', check_in: '2027-02-01T00:00:00', check_out: '2027-02-03T00:00:00' },
    ] })
    renderAt('/backoffice/sejours?vue=arrivals')
    expect(await screen.findByText('Salma Bennani')).toBeInTheDocument()
    expect(screen.queryByText('Karim Tazi')).not.toBeInTheDocument()
  })

  it('saisit une réservation directe', async () => {
    renderAt('/backoffice/sejours')
    await screen.findByText('Salma Bennani')
    await userEvent.click(screen.getByRole('button', { name: 'Saisir un séjour direct' }))
    await userEvent.selectOptions(await screen.findByLabelText('Bien'), '5')
    await userEvent.type(screen.getByLabelText('Arrivée'), '2026-12-10')
    await userEvent.type(screen.getByLabelText('Départ'), '2026-12-14')
    await userEvent.type(screen.getByLabelText('Nom'), 'Yasmine Alaoui')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(svc.createStay).toHaveBeenCalled())
    expect(svc.createStay.mock.calls[0][0]).toMatchObject({
      check_in: '2026-12-10', check_out: '2026-12-14', guest_name: 'Yasmine Alaoui', status: 'confirmed',
    })
  })

  it('ouvre la fiche du séjour avec tout ce qui lui est accroché', async () => {
    renderAt('/backoffice/sejours/2')
    expect(await screen.findByRole('heading', { name: 'Riad Médina' })).toBeInTheDocument()
    expect(screen.getByText('4821')).toBeInTheDocument()
    expect(screen.getByText('salma@example.com')).toBeInTheDocument()
    expect(screen.getByText('Votre arrivée')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir la messagerie' }))
      .toHaveAttribute('href', '/backoffice/sejours/messages?sejour=2')
  })

  // Les deux champs sont saisis en WYSIWYG, mais leurs surfaces diffèrent : les notes sont
  // un bloc à part, les demandes sont rendues **en ligne** derrière un libellé dans la même
  // phrase — un paragraphe HTML y insérerait une rupture au milieu.
  it('rend la mise en forme des notes et projette les demandes en texte', async () => {
    svc.getStay.mockResolvedValue({ ...DETAIL, stay: { ...DETAIL.stay,
      guest_notes: '<p>Arrivée <strong>tardive</strong></p>',
      special_requests: '<p>Lit bébé</p><p>Étage bas</p>' } })
    const { container } = renderAt('/backoffice/sejours/2')
    await screen.findByRole('heading', { name: 'Riad Médina' })

    expect(container.querySelector('.rich-text strong').textContent).toBe('tardive')
    // 🔴 Les demandes : le texte, jamais les balises, et aucun paragraphe dans la phrase.
    const ligne = screen.getByText(/Lit bébé/)
    expect(ligne.textContent).toBe('Lit bébé\nÉtage bas')
    expect(ligne.querySelector('p')).toBeNull()
    expect(container.innerHTML).not.toContain('&lt;p&gt;')
  })

  it('envoie les notes du séjour direct en HTML nettoye', async () => {
    renderAt('/backoffice/sejours')
    await screen.findByText('Salma Bennani')
    await userEvent.click(screen.getByRole('button', { name: 'Saisir un séjour direct' }))
    await userEvent.selectOptions(await screen.findByLabelText('Bien'), '5')
    await userEvent.type(screen.getByLabelText('Arrivée'), '2026-12-10')
    await userEvent.type(screen.getByLabelText('Départ'), '2026-12-14')

    const editor = document.getElementById('stay-notes')
    editor.innerHTML = '<p>Arrivée <b>tardive</b></p><script>alert(1)</script>'
    await userEvent.click(editor)
    await userEvent.tab()

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(svc.createStay).toHaveBeenCalled())
    expect(svc.createStay.mock.calls[0][0]).toMatchObject({
      guest_notes: '<p>Arrivée <b>tardive</b></p>',
    })
  })

  it('annule un séjour après confirmation', async () => {
    renderAt('/backoffice/sejours/2')
    await screen.findByRole('heading', { name: 'Riad Médina' })
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le séjour' }))
    await userEvent.click(screen.getByRole('button', { name: "Confirmer l'annulation" }))
    await vi.waitFor(() => expect(svc.cancelStay).toHaveBeenCalledWith('2'))
  })

  it("n'offre pas la modification d'un séjour venu d'un calendrier", async () => {
    svc.getStay.mockResolvedValue({ ...DETAIL, stay: { ...DETAIL.stay, source: 'ical', editable: false } })
    renderAt('/backoffice/sejours/2')
    await screen.findByRole('heading', { name: 'Riad Médina' })
    expect(screen.queryByRole('button', { name: 'Modifier le séjour' })).not.toBeInTheDocument()
  })

  it('place les séjours du mois dans la grille du calendrier', async () => {
    renderAt('/backoffice/sejours/calendrier')
    expect(await screen.findByRole('link', { name: 'Salma Bennani' }))
      .toHaveAttribute('href', '/backoffice/sejours/2')
  })

  it("montre l'activité des équipes et confie un bien", async () => {
    renderAt('/backoffice/sejours/equipes')
    // Le nom apparaît deux fois : sur la carte de l'équipe et dans la liste d'affectation.
    expect(await screen.findByRole('heading', { name: 'Ménage Gueliz' })).toBeInTheDocument()
    expect(screen.getByText('2 signalements urgents non lus')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Équipe du bien Riad Médina'), '3')
    await vi.waitFor(() => expect(svc.assignTeam).toHaveBeenCalledWith(5, 3))
  })

  it("renvoie vers l'écran Équipe quand l'agence n'en a aucune", async () => {
    svc.listOpsTeams.mockResolvedValue({ ...OPS_TEAMS, teams: [] })
    renderAt('/backoffice/sejours/equipes')
    expect(await screen.findByRole('link', { name: 'Gérer les équipes' }))
      .toHaveAttribute('href', '/backoffice/equipe')
  })

  it('établit le contrat de séjour depuis la fiche', async () => {
    renderAt('/backoffice/sejours/2')
    await screen.findByRole('heading', { name: 'Riad Médina' })
    expect(await screen.findByText('Aucun contrat établi pour ce séjour.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Établir le contrat' }))
    await vi.waitFor(() => expect(svc.createContract).toHaveBeenCalledWith('2'))
  })

  it("montre l'attente de signature quand le contrat existe", async () => {
    svc.getContract.mockResolvedValue({ contract: { id: 55, status: 'finalized', signed_at: null } })
    renderAt('/backoffice/sejours/2')
    expect(await screen.findByText('À signer')).toBeInTheDocument()
    expect(screen.getByText('En attente de la signature du voyageur.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir le contrat' }))
      .toHaveAttribute('href', '/backoffice/contrats/55')
  })
})
