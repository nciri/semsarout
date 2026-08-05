import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import LeasesList from './LeasesList'

function renderLeasesList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LeasesList />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, les appels react-query échouent (pas de serveur) :
// le composant retombe sur l'état d'erreur générique (shared.loadError), qui
// sert d'ancre de rendu stable pour vérifier la bascule FR/AR.
describe('LeasesList i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("affiche le message d'erreur FR", async () => {
    renderLeasesList()
    expect(await screen.findByText('Une erreur est survenue lors du chargement. Réessayez plus tard.')).toBeInTheDocument()
  })

  it("affiche le message d'erreur AR après bascule", async () => {
    await i18n.changeLanguage('ar')
    renderLeasesList()
    expect(await screen.findByText('حدث خطأ أثناء التحميل. حاول مرة أخرى لاحقًا.')).toBeInTheDocument()
  })
})
