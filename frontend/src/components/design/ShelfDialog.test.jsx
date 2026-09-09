import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import ShelfDialog from './ShelfDialog'

const item = (over = {}) => ({
  id: 's1', author_id: 2, base_revision: 3,
  geometry: { walls: [], rooms: [], openings: [] }, ...over,
})

describe('ShelfDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('parle d’un collègue au propriétaire du projet', () => {
    render(<ShelfDialog items={[item()]} ownAuthorId={1} onRecover={vi.fn()} onDismiss={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Un collègue a enregistré une version/)).toBeInTheDocument()
  })

  it('parle de SA version à l’auteur qui vient consulter la sienne', () => {
    // L'étagère est désormais lisible par l'auteur d'une version écartée : lui
    // annoncer « un collègue a enregistré une version » serait faux.
    render(<ShelfDialog items={[item()]} ownAuthorId={2} onRecover={vi.fn()} onDismiss={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Votre version a été mise de côté/)).toBeInTheDocument()
    expect(screen.getByText(/Votre version, basée sur la révision 3/)).toBeInTheDocument()
  })
})
