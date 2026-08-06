import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Pipeline from './Pipeline'

function renderPipeline() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Pipeline />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, les appels react-query échouent (pas de serveur) :
// le composant retombe sur son état "kanban vide", la légende des priorités
// restant toujours affichée et servant d'ancre de rendu stable FR/AR.
describe('Pipeline i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderPipeline()
    expect(await screen.findByText('Pipeline')).toBeInTheDocument()
    expect(await screen.findByText('Légende des priorités')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPipeline()
    expect(await screen.findByText('مسار الصفقات')).toBeInTheDocument()
    expect(await screen.findByText('دليل الأولويات')).toBeInTheDocument()
  })
})
