import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import Home from './Home'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Home /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Home i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un titre statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:home.heroTitle'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:home.heroTitle'))).toBeInTheDocument()
  })
})
