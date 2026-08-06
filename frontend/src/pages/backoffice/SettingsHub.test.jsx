import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import SettingsHub from './SettingsHub'

function renderSettingsHub() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SettingsHub />
    </QueryClientProvider>,
  )
}

describe('SettingsHub i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche les onglets FR', async () => {
    renderSettingsHub()
    expect(await screen.findByText('Agence')).toBeInTheDocument()
    expect(await screen.findByText('Mon compte')).toBeInTheDocument()
  })

  it('affiche les onglets AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderSettingsHub()
    expect(await screen.findByText('الوكالة')).toBeInTheDocument()
    expect(await screen.findByText('حسابي')).toBeInTheDocument()
  })
})
