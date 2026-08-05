import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import AcceptInvitation from './AcceptInvitation'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AcceptInvitation /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AcceptInvitation i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le chargement en FR', async () => {
    renderPage()
    expect(await screen.findByText('Chargement…')).toBeInTheDocument()
  })
  it('rend le chargement en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('جارٍ التحميل…')).toBeInTheDocument()
  })
})
