import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import Checkout from './Checkout'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/panier?service=photos-pro']}><Checkout /></MemoryRouter>,
  )
}

describe('Checkout i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un libellé statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkout.title'))).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkout.title'))).toBeInTheDocument()
  })
})
