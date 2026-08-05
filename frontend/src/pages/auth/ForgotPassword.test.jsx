import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import ForgotPassword from './ForgotPassword'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ForgotPassword /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ForgotPassword i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le bouton en FR', async () => {
    renderPage()
    expect(await screen.findByText('Envoyer le lien de réinitialisation')).toBeInTheDocument()
  })
  it('rend le bouton en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('إرسال رابط إعادة التعيين')).toBeInTheDocument()
  })
})
