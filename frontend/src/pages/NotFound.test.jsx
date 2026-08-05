import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import NotFound from './NotFound'

function renderPage() {
  return render(<MemoryRouter><NotFound /></MemoryRouter>)
}

describe('NotFound i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText('Page non trouvée')).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('الصفحة غير موجودة')).toBeInTheDocument()
  })
})
