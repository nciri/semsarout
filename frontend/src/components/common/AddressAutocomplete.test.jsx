import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import AddressAutocomplete from './AddressAutocomplete'

describe('AddressAutocomplete i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le label par défaut en FR', async () => {
    render(<AddressAutocomplete value="" onChange={() => {}} />)
    expect(await screen.findByText('Adresse complète')).toBeInTheDocument()
  })

  it('affiche le label par défaut en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    render(<AddressAutocomplete value="" onChange={() => {}} />)
    expect(await screen.findByText('العنوان الكامل')).toBeInTheDocument()
  })
})
