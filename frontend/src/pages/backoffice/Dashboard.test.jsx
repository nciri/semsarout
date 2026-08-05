import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Dashboard from './Dashboard'

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Dashboard i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  // Le composant affiche un squelette pendant le chargement react-query, puis
  // l'en-tête (avec le sous-titre) : on attend son apparition avec findByText.
  it('affiche le sous-titre FR', async () => {
    renderDashboard()
    expect(await screen.findByText("Vue d'ensemble de votre activité")).toBeInTheDocument()
  })

  it('affiche le sous-titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderDashboard()
    expect(await screen.findByText('نظرة عامة على نشاطك')).toBeInTheDocument()
  })
})
