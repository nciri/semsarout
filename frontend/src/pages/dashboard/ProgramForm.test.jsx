import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import ProgramForm from './ProgramForm'

function renderProgramForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProgramForm />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Mode création (pas d'id dans l'URL, pas de fetch) : le formulaire démarre
// à l'étape 1, ancre de rendu stable pour la bascule FR/AR.
describe('ProgramForm i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre et les champs de l\'étape 1 en FR', async () => {
    renderProgramForm()
    expect(await screen.findByRole('heading', { name: 'Nouveau programme' })).toBeInTheDocument()
    expect(await screen.findByText('Informations générales')).toBeInTheDocument()
    expect(await screen.findByText('Nom du programme *')).toBeInTheDocument()
  })

  it('affiche le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderProgramForm()
    expect(await screen.findByRole('heading', { name: 'برنامج جديد' })).toBeInTheDocument()
    expect(await screen.findByText('معلومات عامة')).toBeInTheDocument()
  })
})
