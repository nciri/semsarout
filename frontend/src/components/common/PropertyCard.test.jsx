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

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PropertyCard property={property} />
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
})
