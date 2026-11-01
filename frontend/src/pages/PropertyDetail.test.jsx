import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import { propertyService } from '../services/propertyService'
import PropertyDetail from './PropertyDetail'

vi.mock('../services/propertyService', () => ({
  propertyService: { getProperty: vi.fn(), getPricePosition: vi.fn() },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/annonces/1']}>
        <Routes><Route path="/annonces/:id" element={<PropertyDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PropertyDetail i18n', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    vi.clearAllMocks()
    propertyService.getProperty.mockRejectedValue(new Error('absent'))
    propertyService.getPricePosition.mockResolvedValue(null)
  })
  it('rend un libellé statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:propertyDetail.notFound'))).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:propertyDetail.notFound'))).toBeInTheDocument()
  })

  // La description est saisie en WYSIWYG : la fiche publique est la surface qui la montre en
  // entier, donc la seule qui doit en rendre la mise en forme.
  it('rend la mise en forme de la description, jamais ses balises', async () => {
    propertyService.getProperty.mockResolvedValue({
      id: 1, title: 'Riad Médina', city: 'Marrakech', price: 2500000,
      transaction_type: 'sale', property_type: 'villa', images: [], features: [],
      description: '<p>Salon <strong>refait</strong></p><ul><li>terrasse</li></ul>',
    })
    renderPage()
    expect((await screen.findByText('refait')).tagName).toBe('STRONG')
    expect(screen.getByRole('listitem')).toHaveTextContent('terrasse')
    expect(document.body.textContent).not.toContain('<strong>')
  })

  it("n'affiche jamais un script stocké dans la description", async () => {
    propertyService.getProperty.mockResolvedValue({
      id: 1, title: 'Riad', city: 'Marrakech', price: 1, transaction_type: 'sale',
      property_type: 'villa', images: [], features: [],
      description: '<p>ok</p><script>alert(1)</script><img src=x onerror="alert(2)">',
    })
    const { container } = renderPage()
    await screen.findByText('ok')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img[onerror]')).toBeNull()
  })
})
