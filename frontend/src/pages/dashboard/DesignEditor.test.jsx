import { describe, it, expect, beforeEach, afterEach, onTestFinished, vi } from 'vitest'
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

// Panne simulée de la lecture locale : `mode` s'applique au PROCHAIN
// `getLevel` puis se réarme à null, ce qui reproduit exactement une lecture
// qui échoue une fois puis repasse (le cas d'une reprise réussie).
// `background` reste vrai tant qu'on ne le baisse pas : l'image de fond est lue
// par un effet distinct de l'amorçage, et c'est précisément leur indépendance
// qui permet aux deux bandeaux d'apparaître ensemble.
const storage = vi.hoisted(() => ({ mode: null, background: false }))

vi.mock('../../services/design3dLocal', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getLevel: (...args) => {
      const mode = storage.mode
      storage.mode = null
      if (mode === 'reject') return Promise.reject(new Error('IndexedDB indisponible'))
      if (mode === 'missing') return Promise.resolve(undefined)
      return actual.getLevel(...args)
    },
    getBackground: (...args) => {
      if (!storage.background) return actual.getBackground(...args)
      return Promise.resolve({ level_id: args[0], blob: new Blob(['x']), type: 'image/png' })
    },
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

// jsdom ne décode aucune image et n'implémente pas `createObjectURL` : sans ce
// relais, `img.onload` ne partirait jamais et l'éditeur ne verrait pas de fond.
// Rend une fonction de restauration, l'`Image` étant globale au fichier.
function stubBackgroundImage() {
  const src = Object.getOwnPropertyDescriptor(window.Image.prototype, 'src')
  const { createObjectURL, revokeObjectURL } = URL
  URL.createObjectURL = () => 'blob:plan'
  URL.revokeObjectURL = () => {}
  Object.defineProperty(window.Image.prototype, 'src', {
    configurable: true,
    // `naturalWidth` n'est qu'un accesseur en lecture dans jsdom : y écrire
    // lèverait. Le composant retombe seul sur un rapport de 1.
    set() {
      queueMicrotask(() => this.onload?.())
    },
  })
  return () => {
    if (src) Object.defineProperty(window.Image.prototype, 'src', src)
    else delete window.Image.prototype.src
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
  }
}

describe('DesignEditor', () => {
  beforeEach(async () => {
    storage.mode = null
    storage.background = false
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

  it('dit que la lecture du niveau a échoué et rend l’éditeur pleinement utilisable après reprise', async () => {
    storage.mode = 'reject'
    renderEditor()

    // Sans message, l'éditeur resterait grisé pour toujours : l'effet
    // d'amorçage ne se rejoue pas tout seul.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/le stockage local de cet appareil n’a pas répondu|le stockage local de cet appareil n'a pas répondu/)
    expect(screen.getByRole('button', { name: 'Mur' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())

    // « Pleinement utilisable » : pas seulement dégrisé — un tracé doit à
    // nouveau atteindre le stockage local et la file de synchronisation.
    await pickTool('Mur')
    const canvas = screen.getByTestId('floorplan-canvas')
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 300, clientY: 100 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 100 })

    await waitFor(async () => {
      const lv = await local.getLevel(LEVEL_ID)
      expect(lv.geometry.walls).toHaveLength(1)
    }, { timeout: 4000 })
    expect(await local.pendingCount()).toBeGreaterThan(0)
  })

  it('distingue le niveau absent du stockage en erreur', async () => {
    storage.mode = 'missing'
    renderEditor()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Ce niveau est introuvable dans le stockage local de cet appareil.')
    expect(screen.getByRole('button', { name: 'Mur' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    // Le niveau est de nouveau lisible : l'éditeur repart.
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mur' })).toBeEnabled())
  })

  it('garde l’erreur d’amorçage atteignable quand la calibration verrouille aussi l’éditeur', async () => {
    // Fond présent mais niveau illisible : deux lectures IndexedDB distinctes,
    // rien ne les synchronise (fond orphelin, quota partiel, panne d'un seul
    // magasin). Les deux bandeaux s'affichent alors ensemble.
    onTestFinished(stubBackgroundImage())
    storage.background = true
    storage.mode = 'reject'
    renderEditor()

    const alert = await screen.findByRole('alert')
    const retry = screen.getByRole('button', { name: 'Réessayer' })
    const stack = alert.parentElement
    await waitFor(() => expect(stack).toHaveTextContent('Calibrez le plan avant de dessiner'))

    // Le défaut : les deux bandeaux étaient positionnés en absolu au même
    // `top-0` et se recouvraient. Ils doivent s'empiler dans un même flux,
    // l'erreur en premier — sinon le message et sa reprise disparaissent
    // sous le bandeau de calibration, et le verrou redevient muet.
    expect(stack.firstElementChild).toBe(alert)
    expect(alert.className).not.toMatch(/\babsolute\b/)
    expect(stack.lastElementChild.className).not.toMatch(/\babsolute\b/)
    expect(alert).toBeVisible()
    expect(retry).toBeVisible()

    // Et la reprise reste opérante : l'erreur part, le verrou de calibration
    // — lui légitime — demeure.
    fireEvent.click(retry)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getAllByText(/Calibrez le plan avant de dessiner/).length).toBeGreaterThan(0)
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

  it('n’oublie pas le trait qui vient d’être fait quand on change de niveau dans la seconde', async () => {
    // L'enregistrement est différé de 500 ms : bascule d'onglet plus tôt, le
    // `pendingRef` de l'ancien niveau était simplement écrasé (I3).
    const SECOND_ID = 'l2'
    await local.putLevel({
      id: SECOND_ID, project_id: PROJECT_ID, name: 'R+1', position: 1, revision: 0, base_revision: 0,
      wall_height_m: 2.7, calibration: null, geometry: { walls: [], rooms: [], openings: [] }, dirty: false,
    })
    renderEditor()
    await screen.findByRole('tab', { name: 'R+1' })

    await pickTool('Mur')
    const canvas = screen.getByTestId('floorplan-canvas')
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 300, clientY: 100 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 100 })

    // Sans laisser passer la temporisation, on change de niveau.
    fireEvent.click(screen.getByRole('tab', { name: 'R+1' }))

    await waitFor(async () => {
      const lv = await local.getLevel(LEVEL_ID)
      expect(lv.geometry.walls).toHaveLength(1)
    })
    // Le niveau où l'on a basculé, lui, n'a rien reçu.
    expect((await local.getLevel(SECOND_ID)).geometry.walls).toHaveLength(0)
  })

  it('n’oublie pas le trait qui vient d’être fait quand l’onglet passe en arrière-plan', async () => {
    renderEditor()
    await screen.findByRole('tab', { name: 'RDC' })

    await pickTool('Mur')
    const canvas = screen.getByTestId('floorplan-canvas')
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 100 })

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    // Fenêtre volontairement plus courte que la temporisation de 500 ms : sans
    // le filet, l'écriture n'aurait lieu qu'après, si tant est que la page
    // survive (fermeture d'onglet, rechargement de déploiement).
    await waitFor(async () => {
      const lv = await local.getLevel(LEVEL_ID)
      expect(lv.geometry.walls).toHaveLength(1)
    }, { timeout: 300, interval: 10 })
    visibility.mockRestore()
  })

  it('dit qu’une synchronisation de niveau a échoué et permet de la relancer', async () => {
    // Sans cela, `sync_error` n'est lu par aucun composant : l'échec est
    // invisible et le travail local n'a aucune voie de reprise (I2).
    await local.putLevel({
      id: LEVEL_ID, project_id: PROJECT_ID, name: 'RDC', position: 0, revision: 0, base_revision: 0,
      wall_height_m: 2.7, calibration: null, geometry: { walls: [], rooms: [], openings: [] }, dirty: false,
      sync_error: { code: 422, message: 'Géométrie invalide', at: 1 },
    })
    renderEditor()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Géométrie invalide')

    const before = await local.pendingCount()
    fireEvent.click(screen.getByRole('button', { name: 'Renvoyer ce niveau' }))
    // La reprise doit vraiment remettre le niveau en file (et non seulement
    // masquer le message) et effacer la trace de l'échec dépassé.
    await waitFor(async () => expect(await local.pendingCount()).toBe(before + 1))
    await waitFor(async () => {
      const lv = await local.getLevel(LEVEL_ID)
      expect(lv.sync_error).toBeUndefined()
      expect(lv.dirty).toBe(true)
    })
  })

  it('dit que la cible du projet a été refusée (403) au lieu de laisser le travail invisible', async () => {
    await local.putProject({
      id: PROJECT_ID, target_type: 'property', target_id: 1, title: 'Test', status: 'draft', synced: false,
      sync_error: { code: 403, message: 'Cible hors du périmètre de votre agence', at: 1 },
    })
    renderEditor()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Cible hors du périmètre de votre agence')
    // Rien à renvoyer : le refus ne se lève pas en réessayant.
    expect(screen.queryByRole('button', { name: 'Renvoyer ce niveau' })).not.toBeInTheDocument()
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
