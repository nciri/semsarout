import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import MonEspace from './MonEspace'

function renderMonEspace() {
  return render(
    <MemoryRouter>
      <MonEspace user={null} />
    </MemoryRouter>,
  )
}

describe('MonEspace i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le titre et les cartes en FR', async () => {
    renderMonEspace()
    expect(await screen.findByText('Bonjour 👋')).toBeInTheDocument()
    expect(await screen.findByText('Mes annonces')).toBeInTheDocument()
  })

  it('affiche le titre et les cartes en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderMonEspace()
    expect(await screen.findByText('مرحبًا 👋')).toBeInTheDocument()
    expect(await screen.findByText('إعلاناتي')).toBeInTheDocument()
  })
})
