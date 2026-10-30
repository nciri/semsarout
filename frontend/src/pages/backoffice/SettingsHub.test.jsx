import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import SettingsHub from './SettingsHub'

// Les deux panneaux ont leurs propres tests : ici on vérifie la répartition, pas leur contenu.
vi.mock('./Settings', () => ({ default: () => <div>Réglages de l’agence</div> }))
vi.mock('../dashboard/Settings', () => ({ default: () => <div>Réglages du compte</div> }))

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

  it('un seul titre de page, et un panneau par onglet', async () => {
    renderSettingsHub()
    expect(await screen.findByRole('heading', { level: 1, name: 'Paramètres' })).toBeInTheDocument()
    expect(screen.getByText('Réglages de l’agence')).toBeInTheDocument()
    expect(screen.queryByText('Réglages du compte')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Mon compte/ }))
    expect(screen.getByText('Réglages du compte')).toBeInTheDocument()
    expect(screen.queryByText('Réglages de l’agence')).not.toBeInTheDocument()
  })

  it('affiche les onglets AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderSettingsHub()
    expect(await screen.findByText('الوكالة')).toBeInTheDocument()
    expect(await screen.findByText('حسابي')).toBeInTheDocument()
  })
})
