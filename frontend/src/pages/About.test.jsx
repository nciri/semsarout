import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import About from './About'

function renderPage() {
  return render(<MemoryRouter><About /></MemoryRouter>)
}

describe('About i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend "Notre mission" en FR', async () => {
    renderPage()
    expect(await screen.findByText('Notre mission')).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('مهمتنا')).toBeInTheDocument()
  })
})
