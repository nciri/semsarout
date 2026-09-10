import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import GeometryProblems from './GeometryProblems'

const problems = [
  { code: 'wall_too_short', kind: 'wall', id: 'a1b2c3d4e5f6', derived: false },
  { code: 'opening_orphan', kind: 'opening', id: 'ffffffff', derived: true },
]

describe('GeometryProblems', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche un texte sans identifiant technique et masque les conséquences', () => {
    render(<GeometryProblems problems={problems} onSelect={() => {}} onRepair={() => {}} />)
    expect(screen.getByText(/mur est trop court/i)).toBeInTheDocument()
    expect(screen.queryByText(/a1b2c3d4e5f6/)).not.toBeInTheDocument()
    expect(screen.queryByText(/introuvable/i)).not.toBeInTheDocument()
  })

  it('sélectionne l’élément fautif quand on clique le message', async () => {
    const onSelect = vi.fn()
    render(<GeometryProblems problems={problems} onSelect={onSelect} onRepair={() => {}} />)
    await userEvent.click(screen.getByText(/mur est trop court/i))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'wall', id: 'a1b2c3d4e5f6' })
  })

  it('propose la réparation quand un mur dégénéré est présent', async () => {
    const onRepair = vi.fn()
    render(<GeometryProblems problems={problems} onSelect={() => {}} onRepair={onRepair} />)
    await userEvent.click(screen.getByRole('button', { name: /corriger/i }))
    expect(onRepair).toHaveBeenCalled()
  })

  it('n’affiche pas de bouton de réparation sans mur trop court', () => {
    render(
      <GeometryProblems
        problems={[{ code: 'room_type', kind: 'room', id: 'r1', derived: false }]}
        onSelect={() => {}}
        onRepair={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /corriger/i })).not.toBeInTheDocument()
  })

  it('ne présente pas comme touchable un problème qui ne mène à aucun élément', () => {
    // `geometry_too_large` (comme `wall_height`) ne porte ni `kind` ni `id` :
    // il n'y a rien à sélectionner. Le rendre en bouton de 44 px promettait une
    // action qui n'arrivait jamais.
    render(
      <GeometryProblems
        problems={[{ code: 'geometry_too_large', kind: null, id: null, derived: false }]}
        onSelect={() => {}}
        onRepair={() => {}}
      />,
    )
    // Son texte ne dit d'ailleurs pas « Touchez pour… », contrairement aux autres.
    expect(screen.getByText(/trop volumineux/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('ne rend rien quand il n’y a aucun problème non dérivé', () => {
    const { container } = render(
      <GeometryProblems problems={[{ code: 'opening_orphan', kind: 'opening', id: 'o1', derived: true }]} onSelect={() => {}} onRepair={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
