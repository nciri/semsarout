import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Alert } from './kit'

describe('Alert', () => {
  /**
   * Plusieurs appelants y posent une `<ul>` (le bandeau rouge des CRG en attente, celui des
   * dépenses non affectées). Un élément de bloc dans un `<span>` est une imbrication invalide :
   * le navigateur referme le `span` et sort la liste de l'alerte — dans le seul élément qu'on a
   * demandé de toujours voir. Le DOM rendu doit donc contenir la liste.
   */
  it('accueille un élément de bloc sans imbrication invalide', () => {
    render(<Alert tone="crit"><b>Titre</b><ul><li>Première</li></ul></Alert>)
    const liste = screen.getByRole('list')
    expect(liste).toBeInTheDocument()
    // La liste est DANS l'alerte, et son conteneur n'est pas un `span`.
    const conteneur = liste.parentElement
    expect(conteneur.tagName).not.toBe('SPAN')
    expect(conteneur.contains(screen.getByText('Titre'))).toBe(true)
  })
})
