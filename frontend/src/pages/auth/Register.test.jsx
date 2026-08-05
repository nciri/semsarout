import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Register from './Register'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Register /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Register i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le libellé "Type de compte" en FR', async () => {
    renderPage()
    expect(await screen.findByText('Type de compte')).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('نوع الحساب')).toBeInTheDocument()
  })
})
