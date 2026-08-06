import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Visits from './Visits'

function renderVisits() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Visits />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// En environnement de test, l'appel react-query pour le calendrier échoue
// (pas de serveur) : la vue calendrier reste affichée avec son en-tête de
// jours et sa légende de statuts, qui servent d'ancre de rendu stable FR/AR.
describe('Visits i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderVisits()
    expect(await screen.findByText('Visites & RDV')).toBeInTheDocument()
    expect(await screen.findByText('Légende des statuts')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderVisits()
    expect(await screen.findByText('الزيارات والمواعيد')).toBeInTheDocument()
    expect(await screen.findByText('دليل الحالات')).toBeInTheDocument()
  })
})
