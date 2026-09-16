import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from 'react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import SellProperty from './SellProperty'

// La page lit le catalogue (usePricing) au montage. Sans ce mock, l'appel part vers un
// serveur absent sous jsdom et la `AxiosError: Network Error` se journalise APRÈS la fin du
// test, pendant la fermeture du worker vitest : « Closing rpc while "onUserConsoleLog" was
// pending » — suite verte mais processus en échec, de façon intermittente (CI du 2026-09-15).
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(async () => ({ data: { services: [], plans: [] } })),
    post: vi.fn(),
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/vendre']}><SellProperty /></MemoryRouter></QueryClientProvider>)
}

describe('SellProperty i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:sellProperty.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:sellProperty.title'))).toBeInTheDocument()
  })
})
