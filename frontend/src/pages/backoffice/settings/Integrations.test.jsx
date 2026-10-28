import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import api from '../../../services/api'
import Integrations from './Integrations'

const base = (provider, kind, extra = {}) => ({
  provider, kind, fields: ['token'], secret_fields: ['token'], supports_contact_sync: true,
  status: 'not_connected', account_label: null, last_error: null, last_test_at: null,
  last_sync_at: null, synced_count: 0, ...extra,
})

const ROWS = [
  base('odoo', 'erp', { fields: ['url', 'db', 'login', 'password'], secret_fields: ['password'] }),
  base('sap', 'erp', { fields: ['base_url', 'token'], supports_contact_sync: false }),
  base('salesforce', 'crm', { fields: ['instance_url', 'access_token'] }),
  base('hubspot', 'crm'),
  base('zoho', 'crm', { fields: ['api_domain', 'access_token'] }),
]

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

function renderBlock(rows = ROWS) {
  api.get.mockResolvedValue({ data: { integrations: rows } })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><Integrations /></QueryClientProvider>)
}

const cardOf = (name) => screen.getByText(name).closest('div.rounded-lg.border')

describe('Connecteurs ERP et CRM', () => {
  beforeEach(async () => {
    api.get.mockReset(); api.put.mockReset(); api.post.mockReset(); api.delete.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('montre les cinq fournisseurs et leur état réel', async () => {
    renderBlock()
    expect(await screen.findByText('Odoo')).toBeInTheDocument()
    for (const name of ['SAP', 'Salesforce', 'HubSpot', 'Zoho CRM']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getAllByText('Non connecté')).toHaveLength(5)
  })

  it('demande les champs du fournisseur et envoie la connexion', async () => {
    api.put.mockResolvedValue({ data: { ...ROWS[0], status: 'connected' } })
    renderBlock()
    await screen.findByText('Odoo')

    await userEvent.click(within(cardOf('Odoo')).getByRole('button', { name: 'Connecter' }))
    await userEvent.type(screen.getByLabelText("URL de l'instance"), 'https://erp.anfa.ma')
    await userEvent.type(screen.getByLabelText('Base de données'), 'anfa')
    await userEvent.type(screen.getByLabelText('Identifiant'), 'admin')
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la connexion' }))

    expect(api.put).toHaveBeenCalledWith('/backoffice/integrations/odoo', {
      url: 'https://erp.anfa.ma', db: 'anfa', login: 'admin', password: 'secret',
    })
  })

  it('affiche le refus du fournisseur au lieu d’un message maison', async () => {
    api.put.mockRejectedValue({ response: { data: { error: 'Identifiants refusés par le fournisseur.' } } })
    renderBlock()
    await screen.findByText('HubSpot')

    await userEvent.click(within(cardOf('HubSpot')).getByRole('button', { name: 'Connecter' }))
    await userEvent.type(screen.getByLabelText("Jeton d'accès"), 'faux-jeton')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la connexion' }))

    expect(await screen.findByText('Identifiants refusés par le fournisseur.')).toBeInTheDocument()
  })

  it('propose tester et déconnecter une connexion établie, et signale son erreur', async () => {
    api.post.mockResolvedValue({ data: { status: 'connected' } })
    api.delete.mockResolvedValue({ data: {} })
    renderBlock([
      base('hubspot', 'crm', { status: 'connected', account_label: 'HubSpot · jeton valide' }),
      base('zoho', 'crm', { status: 'error', last_error: 'Identifiants refusés par le fournisseur.' }),
    ])
    await screen.findByText('HubSpot')

    expect(screen.getByText('HubSpot · jeton valide')).toBeInTheDocument()
    expect(screen.getByText('Identifiants refusés par le fournisseur.')).toBeInTheDocument()

    await userEvent.click(within(cardOf('HubSpot')).getByRole('button', { name: 'Tester' }))
    expect(api.post).toHaveBeenCalledWith('/backoffice/integrations/hubspot/test')

    await userEvent.click(within(cardOf('HubSpot')).getByRole('button', { name: 'Déconnecter' }))
    expect(api.delete).toHaveBeenCalledWith('/backoffice/integrations/hubspot')
  })

  it('dit quand un fournisseur ne reçoit pas les contacts', async () => {
    renderBlock([base('sap', 'erp', { status: 'connected', supports_contact_sync: false })])
    expect(await screen.findByText(/ne reçoit pas les contacts/)).toBeInTheDocument()
  })

  it('rend les cartes en arabe', async () => {
    await i18n.changeLanguage('ar')
    renderBlock()
    expect(await screen.findByText('أنظمة CRM')).toBeInTheDocument()
    expect(screen.getAllByText('غير مربوط')).toHaveLength(5)
  })
})
