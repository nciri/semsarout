import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../../i18n'
import PropertiesPanel from './PropertiesPanel'

// LRI (U+2066) / PDI (U+2069) : voir FloorplanCanvas.test.jsx pour le contexte —
// jsdom ne recalcule pas la mise en page bidi, ce test vérifie donc la présence
// du marqueur d'isolation produit par le composant, pas l'ordre visuel affiché.
const LRI = '⁦'
const PDI = '⁩'

const geometry = {
  walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, thickness_m: 0.2 }],
  rooms: [],
  openings: [],
}

describe('PropertiesPanel — cotes en contexte RTL', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar')
  })

  it('encadre la longueur de mur « 5.00 m » de marqueurs d’isolation LTR', () => {
    render(
      <div dir="rtl">
        <PropertiesPanel
          state={{ geometry, selection: { kind: 'wall', id: 'w1' } }}
          dispatch={vi.fn()}
          wallHeightM={2.5}
          onWallHeightChange={vi.fn()}
        />
      </div>,
    )
    expect(screen.getByText(`${LRI}5.00 m${PDI}`)).toBeInTheDocument()
  })
})

describe('PropertiesPanel — pavé numérique ouvert sur une sélection qui disparaît (D1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('ne plante pas quand le mur sélectionné est supprimé pendant que son pavé de longueur est ouvert', () => {
    const { rerender } = render(
      <PropertiesPanel
        state={{ geometry, selection: { kind: 'wall', id: 'w1' } }}
        dispatch={vi.fn()}
        wallHeightM={2.5}
        onWallHeightChange={vi.fn()}
      />,
    )
    // Ouvre le pavé numérique de la longueur.
    fireEvent.click(screen.getByRole('button', { name: /Longueur/ }))
    expect(screen.getByLabelText('Longueur')).toBeInTheDocument()

    // Le mur disparaît de la géométrie (supprimé) : la sélection ne correspond
    // plus à rien, mais `padField` reste 'length'.
    const emptyGeometry = { walls: [], rooms: [], openings: [] }
    expect(() =>
      rerender(
        <PropertiesPanel
          state={{ geometry: emptyGeometry, selection: { kind: 'wall', id: 'w1' } }}
          dispatch={vi.fn()}
          wallHeightM={2.5}
          onWallHeightChange={vi.fn()}
        />,
      ),
    ).not.toThrow()
  })

  it('ne plante pas quand une sélection rectangulaire (multi) remplace la sélection pendant que le pavé est ouvert', () => {
    const { rerender } = render(
      <PropertiesPanel
        state={{ geometry, selection: { kind: 'wall', id: 'w1' } }}
        dispatch={vi.fn()}
        wallHeightM={2.5}
        onWallHeightChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Longueur/ }))
    expect(screen.getByLabelText('Longueur')).toBeInTheDocument()

    expect(() =>
      rerender(
        <PropertiesPanel
          state={{ geometry, selection: { kind: 'multi', items: [{ kind: 'wall', id: 'w1' }] } }}
          dispatch={vi.fn()}
          wallHeightM={2.5}
          onWallHeightChange={vi.fn()}
        />,
      ),
    ).not.toThrow()
  })
})
