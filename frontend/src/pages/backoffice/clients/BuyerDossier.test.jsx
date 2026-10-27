import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import api from '../../../services/api'
import BuyerDossier from './BuyerDossier'

const CLIENT = {
  id: 42,
  client_type: 'buyer',
  financing: {
    down_payment: 300000, max_monthly_payment: 6000, borrowing_capacity: 930000,
    realistic_budget: 1230000, declared_budget: 1200000, gap: 30000,
    has_bank_preapproval: false, loan_rate_pct: 4.75, loan_years: 20, verdict: 'financed',
    required_documents: ['cin', 'justificatif_revenu', 'releve_bancaire'],
    missing_documents: ['releve_bancaire'], documents_complete: false,
  },
  documents: [{ id: 5, doc_type: 'cin', status: 'received', filename: 'cin.pdf' }],
}

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() } }))

function renderBlock(client = CLIENT) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><BuyerDossier client={client} /></MemoryRouter></QueryClientProvider>,
  )
}

describe('Dossier d’achat sur la fiche client', () => {
  beforeEach(async () => {
    api.put.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('confronte la capacité réelle au budget annoncé', () => {
    renderBlock()
    expect(screen.getByText('Financement couvert')).toBeInTheDocument()
    expect(screen.getByText(/1\s?230\s?000 Dh/)).toBeInTheDocument()
    expect(screen.getByText(/sur 20 ans à 4.75 %/)).toBeInTheDocument()
    expect(screen.getByText(/Manque : Relevé bancaire/)).toBeInTheDocument()
  })

  it('enregistre la capacité saisie par l’agence', async () => {
    api.put.mockResolvedValue({ data: {} })
    renderBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    await userEvent.clear(screen.getByLabelText('Apport'))
    await userEvent.type(screen.getByLabelText('Apport'), '450000')
    await userEvent.click(screen.getByLabelText('Accord de principe bancaire obtenu'))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(api.put).toHaveBeenCalledWith('/backoffice/clients/42', {
      down_payment: 450000, max_monthly_payment: 6000, has_bank_preapproval: true,
    })
  })

  it('valide une pièce déposée par l’acquéreur', async () => {
    api.patch.mockResolvedValue({ data: {} })
    renderBlock()
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(api.patch).toHaveBeenCalledWith('/backoffice/clients/42/documents/5', { status: 'validated' })
  })

  it('rend le bloc en arabe', async () => {
    await i18n.changeLanguage('ar')
    renderBlock()
    expect(screen.getByText('ملف الشراء')).toBeInTheDocument()
  })
})
