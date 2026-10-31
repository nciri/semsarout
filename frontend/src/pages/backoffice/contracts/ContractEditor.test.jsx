import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import ContractEditor from './ContractEditor'

const { svc, api } = vi.hoisted(() => ({
  svc: { get: vi.fn(), update: vi.fn(), finalize: vi.fn(), markSigned: vi.fn(), pdfUrl: (id) => `/pdf/${id}` },
  api: { get: vi.fn() },
}))
vi.mock('../../../services/contractService', () => ({ contractService: svc }))
vi.mock('../../../services/api', () => ({ default: api }))

const CORPS = '<h3>ARTICLE 1</h3><p>Titre foncier n° …………, ville ………</p>'

function contrat(extra = {}) {
  return { contract: { id: 4, title: 'Bail', status: 'draft', body_html: CORPS,
    filled_fields: {}, fields_count: 2, parties: [], ...extra } }
}

function monte() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/backoffice/contrats/4']}>
        <Routes><Route path="/backoffice/contrats/:id" element={<ContractEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('fr')
  api.get.mockResolvedValue({ data: { clients: [] } })
  svc.update.mockResolvedValue(contrat())
})

describe("écran d'un contrat", () => {
  it('un acte intégré se remplit par champs, sans éditeur de texte', async () => {
    svc.get.mockResolvedValue(contrat({ from_builtin: true }))
    monte()

    expect(await screen.findByText(/Acte fourni avec SemsarOut/)).toBeInTheDocument()
    expect(screen.getByText('0 champ(s) rempli(s) sur 2')).toBeInTheDocument()
    // Pas de barre d'outils : la prose n'est pas modifiable.
    expect(screen.queryByRole('button', { name: 'Gras' })).toBeNull()

    await userEvent.type(screen.getByLabelText('Champ n° 1'), 'TF 45')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/i }))

    // Le corps n'est PAS renvoyé : le serveur refuse de réécrire un acte intégré.
    const envoye = svc.update.mock.calls.at(-1)[1]
    expect(envoye.filled_fields).toEqual({ 1: 'TF 45' })
    expect(envoye).not.toHaveProperty('body_html')
  })

  it('un contrat issu d’un modèle d’agence garde un éditeur de texte', async () => {
    svc.get.mockResolvedValue(contrat({ from_builtin: false }))
    monte()

    expect(await screen.findByRole('button', { name: 'Gras' })).toBeInTheDocument()
    expect(screen.queryByText(/Acte fourni avec SemsarOut/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/i }))
    const envoye = svc.update.mock.calls.at(-1)[1]
    expect(envoye).toHaveProperty('body_html')
    expect(envoye).not.toHaveProperty('filled_fields')
  })
})
