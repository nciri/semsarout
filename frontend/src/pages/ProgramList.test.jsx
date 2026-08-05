import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import ProgramList from './ProgramList'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ProgramList /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProgramList i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:programList.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:programList.title'))).toBeInTheDocument()
  })
})
