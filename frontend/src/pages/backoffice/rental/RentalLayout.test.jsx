import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import RentalLayout from './RentalLayout'

function renderRentalLayout() {
  return render(
    <MemoryRouter>
      <RentalLayout />
    </MemoryRouter>,
  )
}

describe('RentalLayout i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre FR', async () => {
    renderRentalLayout()
    expect(await screen.findByText('Gestion locative')).toBeInTheDocument()
  })

  it('affiche le titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderRentalLayout()
    expect(await screen.findByText('التسيير الكرائي')).toBeInTheDocument()
  })
})
