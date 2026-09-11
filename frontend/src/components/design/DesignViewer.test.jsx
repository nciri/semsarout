import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import DesignViewer from './DesignViewer'

// Comme pour l'éditeur (DesignEditor.test.jsx) : le canevas dessine en mètres
// dans un viewBox, donc sans dimensions de rendu jsdom la conversion pixel →
// mètre serait indéterminée.
function stubCanvasBox() {
  Object.defineProperty(SVGElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }),
  })
}

// Projet publié tel que renvoyé par GET /public/design3d/by-target (ou
// /projects/{id}) : déjà filtré côté service (pas de owner_id/agency_id/tenant/
// revision_author_id) — deux niveaux, plusieurs pièces, aucun fond public autorisé.
function livingRoom(id, name, polygon, type = 'living') {
  return { id, type, name, polygon }
}

const PROJECT = {
  id: 'proj1',
  target_type: 'property',
  target_id: 42,
  title: 'Villa test',
  status: 'ready',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  levels: [
    {
      id: 'l1',
      project_id: 'proj1',
      name: 'RDC',
      position: 0,
      calibration: null,
      wall_height_m: 2.7,
      revision: 3,
      show_background_public: false,
      updated_at: '2026-01-02T00:00:00Z',
      geometry: {
        walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, thickness_m: 0.2 }],
        rooms: [
          livingRoom('r1', '', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], 'living'),
          livingRoom('r2', '', [{ x: 4, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 }, { x: 4, y: 3 }], 'kitchen'),
        ],
        openings: [],
      },
    },
    {
      id: 'l2',
      project_id: 'proj1',
      name: 'R+1',
      position: 1,
      calibration: null,
      wall_height_m: 2.7,
      revision: 1,
      show_background_public: false,
      updated_at: '2026-01-02T00:00:00Z',
      geometry: {
        walls: [],
        rooms: [livingRoom('r3', '', [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }], 'bedroom')],
        openings: [],
      },
    },
  ],
}

// Surface totale attendue : niveau 1 = 12 + 6 = 18 m², niveau 2 = 9 m² → 27 m².
const TOTAL_AREA = '27'

describe('DesignViewer', () => {
  beforeEach(async () => {
    stubCanvasBox()
    await i18n.changeLanguage('fr')
  })

  it('affiche les onglets, les libellés de pièce et la surface totale en FR', async () => {
    render(<DesignViewer project={PROJECT} />)

    expect(await screen.findByRole('tab', { name: 'RDC' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'R+1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'RDC' })).toHaveAttribute('aria-selected', 'true')

    // Légende des types de pièce présents sur le niveau courant (RDC : séjour + cuisine)
    expect(screen.getByText('Séjour')).toBeInTheDocument()
    expect(screen.getByText('Cuisine')).toBeInTheDocument()

    expect(screen.getByText(`Surface totale : ${TOTAL_AREA} m²`)).toBeInTheDocument()
  })

  it('affiche les mêmes informations en arabe après bascule', async () => {
    await i18n.changeLanguage('ar')
    render(<DesignViewer project={PROJECT} />)

    expect(await screen.findByRole('tab', { name: 'RDC' })).toBeInTheDocument()
    expect(screen.getByText('غرفة الجلوس')).toBeInTheDocument()
    expect(screen.getByText('مطبخ')).toBeInTheDocument()
    expect(screen.getByText(`المساحة الإجمالية: ${TOTAL_AREA} م²`)).toBeInTheDocument()
  })

  it("n'affiche aucun fond de plan quand l'agent ne l'a pas autorisé", async () => {
    render(<DesignViewer project={PROJECT} />)
    await screen.findByRole('tab', { name: 'RDC' })
    expect(document.querySelector('image')).not.toBeInTheDocument()
  })

  it('ne rend rien sans projet publié (pas de section vide)', () => {
    const { container } = render(<DesignViewer project={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien pour un projet sans niveau', () => {
    const { container } = render(<DesignViewer project={{ ...PROJECT, levels: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('masque les onglets pour un seul niveau', () => {
    render(<DesignViewer project={{ ...PROJECT, levels: [PROJECT.levels[0]] }} />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})
