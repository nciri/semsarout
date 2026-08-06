import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Subscription from './Subscription'

function renderSubscription() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Subscription />
    </QueryClientProvider>,
  )
}

// Sans utilisateur connecté, les requêtes react-query sont désactivées
// (`enabled: !!user`) : le composant rend directement les plans particulier
// par défaut, ce qui sert d'ancre de rendu stable pour la bascule FR/AR.
describe('Subscription i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre et les onglets en FR', async () => {
    renderSubscription()
    expect(await screen.findByRole('heading', { name: 'Mon abonnement' })).toBeInTheDocument()
    expect(await screen.findByText('Plans & Tarifs')).toBeInTheDocument()
    expect(await screen.findByText('Questions fréquentes')).toBeInTheDocument()
  })

  it('affiche le titre et les onglets en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderSubscription()
    expect(await screen.findByRole('heading', { name: 'اشتراكي' })).toBeInTheDocument()
    expect(await screen.findByText('الباقات والأسعار')).toBeInTheDocument()
  })
})
