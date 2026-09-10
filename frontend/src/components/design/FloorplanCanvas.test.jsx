import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import { initialState } from './useFloorplanEditor'
import FloorplanCanvas from './FloorplanCanvas'

// LRI (U+2066) / PDI (U+2069) : caractères d'isolation directionnelle utilisés
// pour figer l'ordre de lecture « nombre puis unité » d'une cote, quelle que
// soit la direction du document (cf. FloorplanCanvas.jsx / format.js#isolateLtr).
const LRI = '⁦'
const PDI = '⁩'

function stubCanvasBox() {
  Object.defineProperty(SVGElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }),
  })
}

const geometry = {
  walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, thickness_m: 0.2 }],
  rooms: [],
  openings: [],
}

describe('FloorplanCanvas — cotes en contexte RTL', () => {
  beforeEach(async () => {
    stubCanvasBox()
    await i18n.changeLanguage('ar')
  })

  // NB : jsdom ne calcule pas la mise en page bidi (il ne réordonne pas
  // visuellement les caractères), donc ce test ne peut pas constater l'ordre
  // *visuel* affiché à l'écran. Il vérifie ce qui EST observable dans le DOM :
  // que le texte de la cote est bien encadré par les caractères d'isolation
  // LRI/PDI, dans l'ordre nombre-puis-unité, à l'intérieur de l'isolat — le
  // mécanisme qui garantit l'ordre de lecture correct une fois interprété par
  // un vrai moteur de rendu bidi (navigateur). Sans le correctif, ce marqueur
  // est absent et le test échoue.
  it('encadre la cote « 5.00 m » de marqueurs d’isolation LTR, nombre avant unité', () => {
    render(
      <div dir="rtl">
        <FloorplanCanvas state={initialState({ geometry })} dispatch={() => {}} />
      </div>,
    )
    const svg = screen.getByTestId('floorplan-canvas')
    const texts = [...svg.querySelectorAll('text')].map((n) => n.textContent)
    const dimensionText = texts.find((t) => t.includes('5.00'))
    expect(dimensionText).toBe(`${LRI}5.00 m${PDI}`)
  })

  it('encadre la surface « 12.5 m² » d’une pièce de marqueurs d’isolation LTR', () => {
    const geometryWithRoom = {
      walls: [],
      rooms: [{ id: 'r1', type: 'living', name: 'غرفة المعيشة', polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 2.5 }, { x: 0, y: 2.5 }] }],
      openings: [],
    }
    render(
      <div dir="rtl">
        <FloorplanCanvas state={initialState({ geometry: geometryWithRoom })} dispatch={() => {}} />
      </div>,
    )
    const svg = screen.getByTestId('floorplan-canvas')
    const texts = [...svg.querySelectorAll('text')].map((n) => n.textContent)
    const roomText = texts.find((t) => t.includes('12.5'))
    expect(roomText).toBe(`غرفة المعيشة · ${LRI}12.5 m²${PDI}`)
  })
})
