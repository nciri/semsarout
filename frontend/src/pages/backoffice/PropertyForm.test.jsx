import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import PropertyForm from './PropertyForm'

function renderPropertyForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PropertyForm />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Sans id de route, isEditing=false : le formulaire se rend directement en
// mode "nouveau bien" (pas d'appel réseau bloquant), ancre de rendu stable
// pour vérifier la bascule FR/AR.
describe('PropertyForm i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderPropertyForm()
    expect(await screen.findByText('Nouveau bien')).toBeInTheDocument()
    expect(await screen.findByText('Informations générales')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPropertyForm()
    expect(await screen.findByText('عقار جديد')).toBeInTheDocument()
    expect(await screen.findByText('معلومات عامة')).toBeInTheDocument()
  })
})
