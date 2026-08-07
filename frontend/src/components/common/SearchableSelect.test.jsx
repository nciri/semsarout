import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import SearchableSelect from './SearchableSelect'

const OPTIONS = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]

function renderSelect() {
  return render(
    <SearchableSelect value="" onChange={() => {}} options={OPTIONS} />
  )
}

describe('SearchableSelect i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend le placeholder "Sélectionner…" en FR', async () => {
    renderSelect()
    expect(await screen.findByText('Sélectionner…')).toBeInTheDocument()
  })

  it('rend le placeholder arabe après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderSelect()
    expect(await screen.findByText('اختر…')).toBeInTheDocument()
  })
})
