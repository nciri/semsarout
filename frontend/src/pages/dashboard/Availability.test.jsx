import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Availability from './Availability'

function renderAvailability() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Availability />
    </QueryClientProvider>,
  )
}

// En environnement de test, l'appel react-query échoue (pas de serveur) : le
// composant retombe sur ses valeurs par défaut (liste vide), ce qui sert
// d'ancre de rendu stable pour vérifier la bascule FR/AR sur le titre.
describe('Availability i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderAvailability()
    expect(await screen.findByRole('heading', { name: 'Mes disponibilités' })).toBeInTheDocument()
    expect(await screen.findByText('Aucun créneau défini — la réservation en ligne est désactivée sur vos annonces.')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderAvailability()
    expect(await screen.findByRole('heading', { name: 'أوقات توفّري' })).toBeInTheDocument()
  })
})
