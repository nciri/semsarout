import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import StayManagerTabs from './StayManagerTabs'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { connected: false } }) }
}))

function renderTabs() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <StayManagerTabs />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('StayManagerTabs i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it("affiche l'onglet Connexion en FR", async () => {
    renderTabs()
    expect(await screen.findByText('Connexion')).toBeInTheDocument()
  })

  it("affiche l'onglet Connexion en AR après bascule", async () => {
    await i18n.changeLanguage('ar')
    renderTabs()
    expect(await screen.findByText('الاتصال')).toBeInTheDocument()
  })
})
