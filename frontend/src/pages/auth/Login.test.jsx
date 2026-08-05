import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Login from './Login'

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Login i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend le bouton en FR', async () => {
    renderLogin()
    expect(await screen.findByText('Se connecter')).toBeInTheDocument()
  })

  it('rend le bouton en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderLogin()
    expect(await screen.findByText('تسجيل الدخول')).toBeInTheDocument()
  })
})
