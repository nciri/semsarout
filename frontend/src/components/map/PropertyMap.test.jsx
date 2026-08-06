import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import PropertyMap from './PropertyMap'

// Sans coordonnées, le composant retourne l'état vide sans monter Leaflet.
describe('PropertyMap i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le message vide en FR', async () => {
    render(<PropertyMap properties={[]} />)
    expect(await screen.findByText('Aucune annonce avec coordonnées géographiques')).toBeInTheDocument()
  })

  it('affiche le message vide en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    render(<PropertyMap properties={[]} />)
    expect(await screen.findByText('لا يوجد أي إعلان يتوفر على إحداثيات جغرافية')).toBeInTheDocument()
  })
})
