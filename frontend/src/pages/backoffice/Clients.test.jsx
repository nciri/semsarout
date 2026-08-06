import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Clients from './Clients'

function renderClients() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Clients />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, l'appel react-query échoue (pas de serveur) : le
// composant retombe sur son état "liste vide" (crm.clients.list.empty), qui
// sert d'ancre de rendu stable pour vérifier la bascule FR/AR.
describe('Clients i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderClients()
    expect(await screen.findByText('Clients')).toBeInTheDocument()
    expect(await screen.findByText('Aucun client trouvé')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderClients()
    expect(await screen.findByText('العملاء')).toBeInTheDocument()
    expect(await screen.findByText('لم يتم العثور على أي عميل')).toBeInTheDocument()
  })
})
