import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import ContractCreate from './ContractCreate'

const { svc, api } = vi.hoisted(() => ({
  svc: { listTemplates: vi.fn(), create: vi.fn() },
  api: { get: vi.fn() },
}))
vi.mock('../../../services/contractService', () => ({ contractService: svc }))
vi.mock('../../../services/api', () => ({ default: api }))

const TEMPLATES = {
  templates: [{
    id: 1, name: 'Mandat de vente', is_global: true,
    body_html: '<h1>Mandat</h1><p>Vendeur &amp; acheteur&nbsp;: 5 &lt; 6</p><p></p><p></p><p>Fait à Rabat</p>',
  }],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ContractCreate /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Nouveau contrat', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    svc.listTemplates.mockReset().mockResolvedValue(TEMPLATES)
    api.get.mockReset().mockResolvedValue({ data: {} })
  })

  it("montre le texte du modèle, sans balises HTML", async () => {
    renderPage()
    await userEvent.selectOptions(await screen.findByRole('combobox'), '1')
    const preview = await screen.findByText(/Fait à Rabat/)
    expect(preview.textContent).toBe('Mandat\nVendeur & acheteur : 5 < 6\n\nFait à Rabat')
    expect(preview.textContent).not.toMatch(/<\/?[a-z]/i)
    expect(screen.queryByText(/pas de contenu de prévisualisation/)).not.toBeInTheDocument()
  })
})
