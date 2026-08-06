import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Settings from './Settings'

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Settings />
    </QueryClientProvider>,
  )
}

describe('Settings i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre et les onglets FR', async () => {
    renderSettings()
    expect(await screen.findByText('Paramètres')).toBeInTheDocument()
    expect(await screen.findByText('Général')).toBeInTheDocument()
  })

  it('affiche le titre et les onglets AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderSettings()
    expect(await screen.findByText('الإعدادات')).toBeInTheDocument()
    expect(await screen.findByText('عام')).toBeInTheDocument()
  })
})
