import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Team from './Team'

function renderTeam() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Team />
    </QueryClientProvider>,
  )
}

// En environnement de test, l'appel react-query échoue (pas de serveur) : le
// composant retombe sur ses valeurs par défaut, ce qui sert d'ancre de rendu
// stable pour vérifier la bascule FR/AR sur le titre de page.
describe('Team i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderTeam()
    expect(await screen.findByRole('heading', { name: 'Équipe' })).toBeInTheDocument()
    expect(await screen.findByText('Sièges')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderTeam()
    expect(await screen.findByRole('heading', { name: 'الفريق' })).toBeInTheDocument()
    expect(await screen.findByText('المقاعد')).toBeInTheDocument()
  })
})
