import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../../i18n'
import ArtisansDirectory from './ArtisansDirectory'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ArtisansDirectory /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ArtisansDirectory i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend le libellé "Ajouter" (FR)', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('backoffice:artisans.directory.addButton'))).toBeInTheDocument()
  })

  it('rend le libellé "Ajouter" traduit en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('backoffice:artisans.directory.addButton'))).toBeInTheDocument()
  })
})
