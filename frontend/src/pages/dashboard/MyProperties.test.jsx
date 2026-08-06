import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import MyProperties from './MyProperties'

function renderMyProperties() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MyProperties />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, react-query échoue (pas de serveur) : le tableau
// reste vide, ce qui sert d'ancre de rendu stable pour la bascule FR/AR.
describe('MyProperties i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre et les statuts en FR', async () => {
    renderMyProperties()
    expect(await screen.findByRole('heading', { name: 'Mes annonces' })).toBeInTheDocument()
    expect(await screen.findByText('Actives')).toBeInTheDocument()
    expect(await screen.findByText('Aucune annonce trouvée')).toBeInTheDocument()
  })

  it('affiche le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderMyProperties()
    expect(await screen.findByRole('heading', { name: 'إعلاناتي' })).toBeInTheDocument()
    expect(await screen.findByText('نشطة')).toBeInTheDocument()
  })
})
