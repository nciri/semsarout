import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Register from './Register'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn() },
}))

function renderPage(entry = '/inscription') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}><Register /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Register i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le libellé "Type de compte" en FR', async () => {
    renderPage()
    expect(await screen.findByText('Type de compte')).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('نوع الحساب')).toBeInTheDocument()
  })
})

describe('Register — intention selon le rôle', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('pose la question acheteur et ses options par défaut', () => {
    renderPage()
    expect(screen.getByText(i18n.t('auth:register.intentLabel.buyer'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('auth:register.buyerIntents.colocation'))).toBeInTheDocument()
    // Les prestations du catalogue ne concernent pas un acheteur.
    expect(screen.queryByText(i18n.t('common:services.gestion-locative.label'))).not.toBeInTheDocument()
  })

  it('bascule sur la question et les options vendeur quand on choisit Agent', async () => {
    renderPage()
    await userEvent.click(screen.getByText(i18n.t('auth:register.agentRole')))
    expect(screen.getByText(i18n.t('auth:register.intentLabel.agent'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('common:services.gestion-locative.label'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('auth:register.buyerIntents.colocation'))).not.toBeInTheDocument()
  })

  it('arriver depuis une page service ouvre le formulaire en agent, intention pré-cochée', () => {
    // Sans ça, l'option pré-cochée (une prestation) n'aurait aucune case dans la liste acheteur.
    renderPage('/inscription?service=vente')
    expect(screen.getByText(i18n.t('auth:register.intentLabel.agent'))).toBeInTheDocument()
  })

  it('vide une intention devenue invalide après changement de rôle', async () => {
    renderPage('/inscription?service=vente')
    await userEvent.click(screen.getByText(i18n.t('auth:register.buyerRole')))
    const options = screen.getAllByRole('radio', { hidden: true }).filter((r) => r.name === 'interest')
    expect(options.every((r) => !r.checked)).toBe(true)
  })

  it("n'annote pas la question optionnelle (l'étoile rouge marque les champs requis)", () => {
    renderPage()
    expect(screen.queryByText('(optionnel)')).not.toBeInTheDocument()
  })
})
