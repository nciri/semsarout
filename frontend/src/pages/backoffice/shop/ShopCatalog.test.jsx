import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
