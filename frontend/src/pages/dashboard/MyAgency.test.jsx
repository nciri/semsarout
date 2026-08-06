import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import MyAgency from './MyAgency'

function renderMyAgency() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MyAgency />
    </QueryClientProvider>,
  )
}

// Sans utilisateur connecté (pas d'agency_id), la page retombe sur le
// formulaire de création : ancre de rendu stable pour vérifier FR/AR.
describe('MyAgency i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre de création en FR', async () => {
    renderMyAgency()
    expect(await screen.findByText('Créer votre espace agence')).toBeInTheDocument()
  })

  it('affiche le titre de création en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderMyAgency()
    expect(await screen.findByText('أنشئ فضاء وكالتك')).toBeInTheDocument()
  })
})
