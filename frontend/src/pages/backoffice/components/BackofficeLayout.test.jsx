import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import BackofficeLayout from './BackofficeLayout'

// La sidebar lit le tableau de bord pour ses badges (leads, visites) : elle a besoin du
// fournisseur react-query que l'application pose à sa racine.
function renderLayout() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/backoffice']}>
        <BackofficeLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BackofficeLayout i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend les libellés FR', () => {
    renderLayout()
    expect(screen.getAllByText('Clients').length).toBeGreaterThan(0)
  })

  it('rend les libellés AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderLayout()
    expect(screen.getAllByText('العملاء').length).toBeGreaterThan(0)
  })
})
