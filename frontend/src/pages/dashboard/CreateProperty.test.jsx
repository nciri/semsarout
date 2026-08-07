import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import CreateProperty from './CreateProperty'

function renderCreateProperty() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreateProperty />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Mode création (pas d'id dans l'URL) : ancre de rendu stable pour la
// bascule FR/AR sur le titre et les sections du formulaire.
describe('CreateProperty i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre et les sections en FR', async () => {
    renderCreateProperty()
    expect(await screen.findByRole('heading', { name: 'Créer une annonce' })).toBeInTheDocument()
    expect(await screen.findByText('Type de transaction')).toBeInTheDocument()
  })

  it('affiche le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderCreateProperty()
    expect(await screen.findByRole('heading', { name: 'إنشاء إعلان' })).toBeInTheDocument()
    expect(await screen.findByText('نوع المعاملة')).toBeInTheDocument()
  })
})
