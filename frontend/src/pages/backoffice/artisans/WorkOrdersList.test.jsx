import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import WorkOrdersList from './WorkOrdersList'

function renderWorkOrdersList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WorkOrdersList />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, l'appel react-query échoue (pas de serveur) :
// orders reste vide et le composant retombe sur l'état vide (empty.title),
// qui sert d'ancre de rendu stable pour vérifier la bascule FR/AR.
describe('WorkOrdersList i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("affiche le titre FR", async () => {
    renderWorkOrdersList()
    expect(await screen.findByText('Aucun bon de travaux')).toBeInTheDocument()
    expect(await screen.findByText('Nouveau')).toBeInTheDocument()
  })

  it("affiche le titre AR après bascule", async () => {
    await i18n.changeLanguage('ar')
    renderWorkOrdersList()
    expect(await screen.findByText('لا يوجد أمر عمل')).toBeInTheDocument()
    expect(await screen.findByText('جديد')).toBeInTheDocument()
  })
})
