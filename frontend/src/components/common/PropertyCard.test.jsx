import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import PropertyCard from './PropertyCard'

const property = {
  id: 1,
  title: 'Appartement test',
  price: 1200000,
  transaction_type: 'sale',
  city: 'Casablanca',
  images: []
}

function renderCard(over = {}, props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PropertyCard property={{ ...property, ...over }} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PropertyCard i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend le libellé de transaction en FR', async () => {
    renderCard()
    expect(await screen.findByText(i18n.t('common:propertyCard.sale'))).toBeInTheDocument()
  })

  it('rend le libellé de transaction en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderCard()
    expect(await screen.findByText(i18n.t('common:propertyCard.sale'))).toBeInTheDocument()
  })

  // La description est saisie en WYSIWYG : l'extrait d'une carte tient sur deux lignes et ne
  // peut pas porter de mise en forme — il doit montrer le texte, jamais les balises.
  it("réduit la description au texte dans l'extrait de la carte", () => {
    // L'extrait n'existe que dans la variante horizontale (liste), pas sur la carte verticale.
    const { container } = renderCard({
      description: '<p>Salon <strong>refait</strong></p><ul><li>terrasse</li></ul>',
    }, { variant: 'horizontal' })
    expect(screen.getByText(/Salon refait\s+terrasse/)).toBeInTheDocument()
    expect(container.textContent).not.toContain('<strong>')
    expect(container.querySelector('strong')).toBeNull()
  })
})
