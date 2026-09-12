import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from 'react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import Footer from './Footer'

function renderFooter() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><Footer /></MemoryRouter></QueryClientProvider>)
}

describe('Footer i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend "Mentions légales" en FR', async () => {
    renderFooter()
    expect(await screen.findByText('Mentions légales')).toBeInTheDocument()
  })
  it('rend le lien en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderFooter()
    expect(await screen.findByText('البيانات القانونية')).toBeInTheDocument()
  })
})
