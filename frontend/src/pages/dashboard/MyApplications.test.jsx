import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import MyApplications from './MyApplications'

function renderMyApplications() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MyApplications />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Sans backend disponible, la requête échoue et isLoading redevient false : le
// composant retombe sur son état vide, ancre de rendu stable pour FR/AR.
describe('MyApplications i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre en FR', async () => {
    renderMyApplications()
    expect(await screen.findByText('Mes candidatures')).toBeInTheDocument()
  })

  it('affiche le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderMyApplications()
    expect(await screen.findByText('طلبات الترشح')).toBeInTheDocument()
  })
})
