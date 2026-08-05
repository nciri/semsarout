import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import AgencyDetail from './AgencyDetail'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/agences/demo']}>
        <Routes>
          <Route path="/agences/:slug" element={<AgencyDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AgencyDetail i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un libellé statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:agencyDetail.notFound'))).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:agencyDetail.notFound'))).toBeInTheDocument()
  })
})
