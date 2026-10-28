import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import Settings from './Settings'

const SETTINGS = {
  agency_name: 'Immobilière Anfa', agency_email: 'contact@anfa.ma',
  default_sale_commission_fee: 12000, default_rental_commission_rate: 50,
  timezone: 'Africa/Casablanca', currency: 'MAD',
  lead_auto_assign: false, sms_notifications: false, visit_reminder_hours: 24,
  smtp_host: 'smtp.anfa.ma', smtp_port: '587', smtp_user: 'envoi@anfa.ma',
}

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }))
// L'onglet « Profil » réemploie l'écran « Mon agence » : son contenu a ses propres tests.
vi.mock('../dashboard/MyAgency', () => ({ default: () => <div>Profil de l’agence</div> }))

function renderSettings() {
  api.get.mockImplementation(async (url) => (
    url === '/backoffice/settings' ? { data: SETTINGS } : { data: {} }))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><Settings /></MemoryRouter></QueryClientProvider>,
  )
}

describe('Paramètres de l’agence', () => {
  beforeEach(async () => {
    api.get.mockReset()
    api.put.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('ouvre sur le profil de l’agence, saisi à un seul endroit', async () => {
    renderSettings()
    expect(await screen.findByText('Paramètres')).toBeInTheDocument()
    expect(screen.getByText('Profil de l’agence')).toBeInTheDocument()
    // Le profil ne se saisit plus ici : ni nom d'agence, ni adresse dans cet écran.
    expect(screen.queryByLabelText(/Nom de l'agence/)).not.toBeInTheDocument()
  })

  it('n’affiche plus les réglages de sécurité, qui sont personnels', async () => {
    renderSettings()
    await screen.findByText('Paramètres')
    for (const absent of ['Sécurité', 'Notifications']) {
      expect(screen.queryByRole('button', { name: absent })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Règles' })).toBeInTheDocument()
  })

  it('enregistre les barèmes de commission sans toucher au profil', async () => {
    api.put.mockResolvedValue({ data: SETTINGS })
    renderSettings()
    await screen.findByText('Paramètres')
    await userEvent.click(screen.getByRole('button', { name: 'Commissions' }))

    const forfait = screen.getByLabelText('Commission sur une vente (Dh)')
    await userEvent.clear(forfait)
    await userEvent.type(forfait, '15000')
    await userEvent.click(screen.getByRole('button', { name: /Sauvegarder/ }))

    const sent = api.put.mock.calls[0][1]
    expect(sent.default_sale_commission_fee).toBe('15000')
    expect(sent.default_rental_commission_rate).toBe(50)
    expect(Object.keys(sent).some((k) => k.startsWith('agency_'))).toBe(false)
  })

  it('renvoie les alertes personnelles vers l’onglet du compte', async () => {
    renderSettings()
    await screen.findByText('Paramètres')
    await userEvent.click(screen.getByRole('button', { name: 'Règles' }))
    expect(screen.getByText(/Mon compte/)).toBeInTheDocument()
  })

  it('affiche les onglets en arabe après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderSettings()
    expect(await screen.findByText('الإعدادات')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'العمولات' })).toBeInTheDocument()
  })
})
