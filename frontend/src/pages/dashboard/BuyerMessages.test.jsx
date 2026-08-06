import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import BuyerMessages from './BuyerMessages'

function renderBuyerMessages() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BuyerMessages />
    </QueryClientProvider>,
  )
}

describe('BuyerMessages i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre en FR', async () => {
    renderBuyerMessages()
    expect(await screen.findByText('Mes messages')).toBeInTheDocument()
  })

  it('affiche le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderBuyerMessages()
    expect(await screen.findByText('رسائلي')).toBeInTheDocument()
  })
})
