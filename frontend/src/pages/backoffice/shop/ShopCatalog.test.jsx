import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import ShopCatalog from './ShopCatalog'

function renderShopCatalog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ShopCatalog />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Le titre de page (shop.shared.pageTitle) est rendu immédiatement, quel que
// soit l'état des requêtes react-query : ancre de rendu stable pour vérifier
// la bascule FR/AR.
describe('ShopCatalog i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderShopCatalog()
    expect(await screen.findByText('Boutique')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderShopCatalog()
    expect(await screen.findByText('المتجر')).toBeInTheDocument()
  })
})

describe('ShopCatalog — suivi des commandes', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("ne s'affiche qu'au clic sur « Suivre les commandes », et se replie au second clic", async () => {
    renderShopCatalog()
    await screen.findByText('Boutique')
    expect(screen.queryByRole('heading', { name: 'Suivi des commandes' })).not.toBeInTheDocument()
    const [btn] = screen.getAllByRole('button', { name: 'Suivre les commandes' })
    await userEvent.click(btn)
    expect(screen.getByRole('heading', { name: 'Suivi des commandes' })).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(btn)
    expect(screen.queryByRole('heading', { name: 'Suivi des commandes' })).not.toBeInTheDocument()
  })
})
