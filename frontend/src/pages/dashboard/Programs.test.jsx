import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Programs from './Programs'

function renderPrograms() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Programs />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, react-query échoue (pas de serveur) : la liste
// reste vide, ce qui sert d'ancre de rendu stable pour la bascule FR/AR.
describe('Programs i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre et l\'état vide en FR', async () => {
    renderPrograms()
    expect(await screen.findByRole('heading', { name: 'Mes annonces' })).toBeInTheDocument()
    expect(await screen.findByText('Aucun programme trouvé')).toBeInTheDocument()
  })

  it('affiche le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPrograms()
    expect(await screen.findByRole('heading', { name: 'إعلاناتي' })).toBeInTheDocument()
    expect(await screen.findByText('لم يتم العثور على أي برنامج')).toBeInTheDocument()
  })
})
