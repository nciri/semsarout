import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import { SearchInput, GatedNotice } from './ui'

describe('backoffice/ui i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('SearchInput utilise le placeholder FR par défaut', () => {
    render(<SearchInput value="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Rechercher…')).toBeInTheDocument()
  })

  it('SearchInput utilise le placeholder AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    render(<SearchInput value="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('ابحث…')).toBeInTheDocument()
  })

  it('GatedNotice rend le libellé FR', () => {
    render(<GatedNotice title="t" message="m" />)
    expect(screen.getByText('Voir les offres Pro & Entreprise')).toBeInTheDocument()
  })

  it('GatedNotice rend le libellé AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    render(<GatedNotice title="t" message="m" />)
    expect(screen.getByText('عرض عروض Pro والمؤسسات')).toBeInTheDocument()
  })
})
