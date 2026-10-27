import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import api from '../../services/api'
import MyPurchaseFile from './MyPurchaseFile'

const DOSSIER = {
  client_id: 42,
  agency_id: 1,
  qualification: {
    declared_budget: 1200000, realistic_budget: 980000, has_bank_preapproval: false,
    verdict: 'tight', required_documents: ['cin', 'justificatif_revenu', 'releve_bancaire'],
    missing_documents: ['justificatif_revenu', 'releve_bancaire'], documents_complete: false,
  },
  documents: [{ id: 5, doc_type: 'cin', status: 'received', filename: 'cin.pdf' }],
}

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

function renderPage(dossiers = [DOSSIER]) {
  api.get.mockResolvedValue({ data: { dossiers } })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><MyPurchaseFile /></MemoryRouter></QueryClientProvider>,
  )
}

describe('Mon dossier d’achat', () => {
  beforeEach(async () => {
    api.get.mockReset()
    api.post.mockReset()
    api.delete.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('montre le budget réaliste et ce qui manque encore', async () => {
    renderPage()
    expect(await screen.findByText('Budget réaliste')).toBeInTheDocument()
    expect(screen.getByText(/980\s?000 Dh/)).toBeInTheDocument()
    expect(screen.getByText(/Justificatif de revenu, Relevé bancaire/)).toBeInTheDocument()
  })

  it('dépose une pièce sur le bon dossier, avec son type', async () => {
    api.post.mockResolvedValue({ data: { id: 9 } })
    const { container } = renderPage()
    await screen.findByText('Mes pièces')

    await userEvent.selectOptions(screen.getByLabelText('Type de pièce'), 'releve_bancaire')
    const file = new File(['%PDF-1.4'], 'releve.pdf', { type: 'application/pdf' })
    await userEvent.upload(container.querySelector('input[type="file"]'), file)

    expect(api.post).toHaveBeenCalledWith('/buyer-dossier/42/documents', file, expect.objectContaining({
      params: { doc_type: 'releve_bancaire', filename: 'releve.pdf' },
    }))
  })

  it('retire une pièce déposée par erreur, sauf si l’agence l’a validée', async () => {
    api.delete.mockResolvedValue({ data: {} })
    const { unmount } = renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer' }))
    expect(api.delete).toHaveBeenCalledWith('/buyer-dossier/42/documents/5')

    unmount()
    renderPage([{ ...DOSSIER, documents: [{ ...DOSSIER.documents[0], status: 'validated' }] }])
    expect(await screen.findByText('Validée')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
  })

  it('explique l’absence de dossier plutôt que d’afficher une page vide', async () => {
    renderPage([])
    expect(await screen.findByText(/Aucune agence ne suit encore/)).toBeInTheDocument()
  })

  it('rend la page en arabe', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('ملف الشراء الخاص بي')).toBeInTheDocument()
  })
})
