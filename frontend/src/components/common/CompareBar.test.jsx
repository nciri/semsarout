import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import useCompareStore from '../../store/compareStore'
import CompareBar from './CompareBar'

function renderBar() {
  return render(
    <MemoryRouter>
      <CompareBar />
    </MemoryRouter>,
  )
}

describe('CompareBar i18n', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    useCompareStore.setState({ propertyIds: [1, 2] })
  })

  it('affiche le bouton Comparer en FR', async () => {
    renderBar()
    expect(await screen.findByText('Comparer')).toBeInTheDocument()
  })

  it('affiche la version AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderBar()
    expect(await screen.findByText('مقارنة')).toBeInTheDocument()
  })
})
