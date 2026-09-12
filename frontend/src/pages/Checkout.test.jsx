import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from 'react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import Checkout from './Checkout'

// La page résout son montant depuis le catalogue : sans catalogue, elle renvoie vers les
// services plutôt que d'afficher un prix inventé. Le test doit donc le servir.
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(async () => ({
      data: { services: [{ code: 'photos-pro-360', amount: 500, currency: 'MAD', kind: 'one_off' }], plans: [] },
    })),
    post: vi.fn(),
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/panier?service=photos-pro-360']}><Checkout /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Checkout i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un libellé statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkout.title'))).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkout.title'))).toBeInTheDocument()
  })
})
