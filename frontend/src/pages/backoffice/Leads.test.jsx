import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Leads from './Leads'

function renderLeads() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Leads />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, l'appel react-query échoue (pas de serveur) : le
// composant retombe sur son état "liste vide" (crm.pipeline.leads.list.empty),
// qui sert d'ancre de rendu stable pour vérifier la bascule FR/AR.
describe('Leads i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderLeads()
    expect(await screen.findByText('Leads')).toBeInTheDocument()
    expect(await screen.findByText('Aucun lead trouvé')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderLeads()
    expect(await screen.findByText('العملاء المحتملون')).toBeInTheDocument()
    expect(await screen.findByText('لم يتم العثور على أي عميل محتمل')).toBeInTheDocument()
  })
})
