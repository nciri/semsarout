import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import MarketPrices from './MarketPrices'

function renderMarketPrices() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MarketPrices />
    </QueryClientProvider>,
  )
}

// Sans utilisateur admin connecté, la page retombe sur son message de garde
// d'accès : ancre de rendu stable pour vérifier la bascule FR/AR.
describe('MarketPrices i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le message de garde en FR', async () => {
    renderMarketPrices()
    expect(await screen.findByText('Cette page est réservée aux administrateurs.')).toBeInTheDocument()
  })

  it('affiche le message de garde en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderMarketPrices()
    expect(await screen.findByText('هذه الصفحة مخصصة للمسؤولين فقط.')).toBeInTheDocument()
  })
})
