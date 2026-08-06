import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import AgencyMap from './AgencyMap'

// Sans coordonnées, le composant retourne l'état vide sans monter Leaflet.
describe('AgencyMap i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le message vide en FR', async () => {
    render(<AgencyMap agencies={[]} />)
    expect(await screen.findByText('Aucune agence avec coordonnées géographiques')).toBeInTheDocument()
  })

  it('affiche le message vide en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    render(<AgencyMap agencies={[]} />)
    expect(await screen.findByText('لا توجد وكالة تتوفر على إحداثيات جغرافية')).toBeInTheDocument()
  })
})
