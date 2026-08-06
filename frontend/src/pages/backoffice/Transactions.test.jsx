import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Transactions from './Transactions'

function renderTransactions() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, l'appel react-query échoue (pas de serveur) : le
// composant retombe sur son état "aucune transaction", qui sert d'ancre de
// rendu stable FR/AR aux côtés du titre de page.
describe('Transactions i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderTransactions()
    expect(await screen.findByText('Transactions')).toBeInTheDocument()
    expect(await screen.findByText('Nouvelle transaction')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderTransactions()
    expect(await screen.findByText('المعاملات')).toBeInTheDocument()
    expect(await screen.findByText('معاملة جديدة')).toBeInTheDocument()
  })
})
