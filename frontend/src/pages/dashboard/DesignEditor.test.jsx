import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import * as local from '../../services/design3dLocal'
import useAuthStore from '../../store/authStore'
import DesignEditor from './DesignEditor'

// Le serveur est injoignable pendant les tests : le client HTTP échoue comme
// hors-ligne, ce qui est justement le mode nominal de l'éditeur — rien de ce
// qui suit ne doit dépendre du réseau.
vi.mock('../../services/design3dApi', () => {
  const netErr = () => Object.assign(new Error('net'), { code: 'ERR_NETWORK' })
  return {
    createProject: vi.fn(() => Promise.reject(netErr())),
    listProjects: vi.fn(() => Promise.reject(netErr())),
    getProject: vi.fn(() => Promise.reject(netErr())),
    updateProject: vi.fn(() => Promise.reject(netErr())),
    deleteProject: vi.fn(() => Promise.reject(netErr())),
    createLevel: vi.fn(() => Promise.reject(netErr())),
    updateLevel: vi.fn(() => Promise.reject(netErr())),
    deleteLevel: vi.fn(() => Promise.reject(netErr())),
    uploadBackground: vi.fn(() => Promise.reject(netErr())),
    recalibrate: vi.fn(() => Promise.reject(netErr())),
    listShelf: vi.fn(() => Promise.reject(netErr())),
    dismissShelf: vi.fn(() => Promise.reject(netErr())),
    sync: vi.fn(() => Promise.reject(netErr())),
  }
})

const PROJECT_ID = 'p1'
const LEVEL_ID = 'l1'

async function seedLevel() {
  await local.clearAll()
  await local.putProject({ id: PROJECT_ID, target_type: 'property', target_id: 1, title: 'Test', status: 'draft' })
  await local.putLevel({
    id: LEVEL_ID, project_id: PROJECT_ID, name: 'RDC', position: 0, revision: 0, base_revision: 0,
    wall_height_m: 2.7, calibration: null, geometry: { walls: [], rooms: [], openings: [] }, dirty: false,
  })
}

// Signal explicite d'un éditeur prêt à recevoir un tracé : la barre d'outils
// n'est active qu'une fois le niveau lu depuis IndexedDB. Attendre l'onglet du
// niveau ne suffit PAS — il apparaît avant, et dessiner à ce moment-là faisait
// écraser le tracé par l'amorçage (cf. correctif round 2).
async function pickTool(name) {
  const btn = screen.getByRole('button', { name })
  await waitFor(() => expect(btn).toBeEnabled())
  fireEvent.click(btn)
  return btn
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/conception/${PROJECT_ID}`]}>
      <Routes>
        <Route path="/dashboard/conception/:projectId" element={<DesignEditor />} />
      </Routes>
    </MemoryRouter>,
  )
}

// L'éditeur dessine en mètres dans un viewBox : sans dimensions de rendu (jsdom
// ne calcule aucune boîte), la conversion pixel → mètre serait indéterminée.
function stubCanvasBox() {
  Object.defineProperty(SVGElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }),
  })
}

describe('DesignEditor', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    await seedLevel()
    stubCanvasBox()
    useAuthStore.setState({ user: { id: 1, features: ['design3d'] }, accessToken: null, isAuthenticated: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche l’éditeur et sa barre d’outils en FR', async () => {
    renderEditor()
    expect(await screen.findByRole('heading', { name: 'Éditeur de plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mur' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Sélectionner' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('tab', { name: 'RDC' })).toBeInTheDocument()
  })

  it('affiche l’éditeur en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderEditor()
    expect(await screen.findByRole('heading', { name: 'محرر المخطط' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'جدار' })).toBeInTheDocument()
  })

  it('sans le module, propose de l’activer au lieu de l’éditeur', async () => {
    useAuthStore.setState({ user: { id: 1, features: [] }, accessToken: null })
    renderEditor()
    expect(await screen.findByRole('heading', { name: 'Module conception 3D' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mur' })).not.toBeInTheDocument()
  })

  it('n’accepte aucun tracé tant que le niveau n’est pas chargé', async () => {
    renderEditor()
    // Au montage, la lecture IndexedDB du niveau n'a pas encore rendu la main :
    // un tracé accepté ici serait effacé par l'amorçage qui suit.
    expect(screen.getByRole('button', { name: 'Mur' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mur' })).toBeEnabled())
  })

  it('trace un mur au doigt et met l’édition en file sans réseau', async () => {
    renderEditor()
    await screen.findByRole('tab', { name: 'RDC' })

    await pickTool('Mur')
    const canvas = screen.getByTestId('floorplan-canvas')
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 300, clientY: 100 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 100 })

    await waitFor(async () => {
      const lv = await local.getLevel(LEVEL_ID)
      expect(lv.geometry.walls).toHaveLength(1)
      // Temporisation de 500 ms de l'éditeur + aller-retour IndexedDB.
    }, { timeout: 4000 })

    expect(await local.pendingCount()).toBeGreaterThan(0)
    const lv = await local.getLevel(LEVEL_ID)
    expect(lv.dirty).toBe(true)
    // 200 px sur 800 px de large pour 20 m de champ visible → 5 m.
    expect(lv.geometry.walls[0].b.x - lv.geometry.walls[0].a.x).toBeCloseTo(5, 1)
  })

  it('ne réinitialise pas le travail en cours quand le niveau local change sous l’éditeur', async () => {
    renderEditor()
    await screen.findByRole('tab', { name: 'RDC' })

    await pickTool('Mur')
    const canvas = screen.getByTestId('floorplan-canvas')
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 100 })

    // Un rafraîchissement de fond réécrit l'enregistrement local : l'éditeur ne
    // doit pas se réamorcer dessus, sinon le mur qu'on vient de tracer
    // disparaîtrait sous les doigts de l'utilisateur.
    await local.putLevel({
      id: LEVEL_ID, project_id: PROJECT_ID, name: 'RDC', position: 0, revision: 9, base_revision: 9,
      wall_height_m: 2.7, calibration: null, geometry: { walls: [], rooms: [], openings: [] }, dirty: false,
    })

    await waitFor(() => {
      expect(screen.getByTestId('floorplan-canvas').querySelectorAll('line').length).toBeGreaterThan(0)
    })
  })
})
