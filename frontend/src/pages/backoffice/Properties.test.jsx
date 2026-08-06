import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Properties from './Properties'

function renderProperties() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Properties />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, l'appel react-query échoue (pas de serveur) : le
// composant retombe sur son état "liste vide" (crm.properties.list.empty), qui
// sert d'ancre de rendu stable pour vérifier la bascule FR/AR.
describe('Properties i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderProperties()
    expect(await screen.findByText('Biens immobiliers')).toBeInTheDocument()
    expect(await screen.findByText('Aucun bien trouvé')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderProperties()
    expect(await screen.findByText('العقارات')).toBeInTheDocument()
    expect(await screen.findByText('لا يوجد أي عقار')).toBeInTheDocument()
  })
})
