import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import BackofficeLayout from './BackofficeLayout'

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/backoffice']}>
      <BackofficeLayout />
    </MemoryRouter>,
  )
}

describe('BackofficeLayout i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend les libellés FR', () => {
    renderLayout()
    expect(screen.getAllByText('Clients').length).toBeGreaterThan(0)
  })

  it('rend les libellés AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderLayout()
    expect(screen.getAllByText('العملاء').length).toBeGreaterThan(0)
  })
})
