import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import MesBiensTabs from './MesBiensTabs'

function renderTabs() {
  return render(
    <MemoryRouter>
      <MesBiensTabs />
    </MemoryRouter>,
  )
}

describe('MesBiensTabs i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche « En vente » en FR', async () => {
    renderTabs()
    expect(await screen.findByText('En vente')).toBeInTheDocument()
  })

  it('affiche la version AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderTabs()
    expect(await screen.findByText('للبيع')).toBeInTheDocument()
  })
})
