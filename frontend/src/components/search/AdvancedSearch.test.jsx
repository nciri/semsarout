import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import AdvancedSearch from './AdvancedSearch'

function renderSearch() {
  return render(
    <MemoryRouter>
      <AdvancedSearch />
    </MemoryRouter>,
  )
}

describe('AdvancedSearch i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend le bouton de recherche en FR', async () => {
    renderSearch()
    expect(await screen.findByText(i18n.t('common:advancedSearch.search'))).toBeInTheDocument()
  })

  it('rend le bouton de recherche en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderSearch()
    expect(await screen.findByText(i18n.t('common:advancedSearch.search'))).toBeInTheDocument()
  })
})
