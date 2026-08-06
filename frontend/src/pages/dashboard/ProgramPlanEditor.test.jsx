import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import ProgramPlanEditor from './ProgramPlanEditor'

function renderEditor() {
  return render(
    <MemoryRouter>
      <ProgramPlanEditor />
    </MemoryRouter>,
  )
}

// En environnement de test, le chargement des plans échoue (pas de serveur) :
// la page retombe sur son état "aucun plan", ancre de rendu stable pour la
// bascule FR/AR sur le titre.
describe('ProgramPlanEditor i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre en FR', async () => {
    renderEditor()
    expect(await screen.findByRole('heading', { name: 'Plan interactif des lots' })).toBeInTheDocument()
    expect(await screen.findByText('Créez un premier plan pour commencer à placer vos lots.')).toBeInTheDocument()
  })

  it('affiche le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderEditor()
    expect(await screen.findByRole('heading', { name: 'مخطط تفاعلي للوحدات' })).toBeInTheDocument()
  })
})
