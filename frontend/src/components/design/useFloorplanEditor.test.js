import { describe, it, expect } from 'vitest'
import { reducer, initialState, HISTORY_MAX, resizedWall, hitTest, MIN_WALL_M, selectionItems } from './useFloorplanEditor'
import { wallLength } from '../../utils/floorplan'

const wall = (id, x = 0, len = 4) => ({ id, a: { x, y: 0 }, b: { x: x + len, y: 0 }, thickness_m: 0.2 })
const s0 = () => initialState({ geometry: { walls: [], rooms: [], openings: [] } })

describe('reducer — murs et historique', () => {
  it('ajoute un mur et supporte annuler/refaire', () => {
    const s1 = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    expect(s1.geometry.walls).toHaveLength(1)
    const s2 = reducer(s1, { type: 'UNDO' })
    expect(s2.geometry.walls).toHaveLength(0)
    expect(reducer(s2, { type: 'REDO' }).geometry.walls).toHaveLength(1)
  })

  it('une nouvelle action purge la pile de refaire', () => {
    let s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    s = reducer(s, { type: 'UNDO' })
    expect(s.future).toHaveLength(1)
    s = reducer(s, { type: 'ADD_WALL', wall: wall('w2') })
    expect(s.future).toHaveLength(0)
  })

  it('annuler sans historique ne change rien', () => {
    const s = s0()
    expect(reducer(s, { type: 'UNDO' })).toBe(s)
    expect(reducer(s, { type: 'REDO' })).toBe(s)
  })

  it('plafonne la pile d’annulation à 50', () => {
    let s = s0()
    for (let i = 0; i < 60; i++) s = reducer(s, { type: 'ADD_WALL', wall: wall(`w${i}`, i, 1) })
    expect(HISTORY_MAX).toBe(50)
    expect(s.past.length).toBe(50)
    expect(s.geometry.walls).toHaveLength(60)
  })

  it('les actions non géométriques ne touchent pas l’historique', () => {
    let s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    const before = s.past.length
    s = reducer(s, { type: 'SET_TOOL', tool: 'room' })
    s = reducer(s, { type: 'SELECT', selection: { kind: 'wall', id: 'w1' } })
    s = reducer(s, { type: 'SET_VIEW', view: { zoom: 2 } })
    s = reducer(s, { type: 'SET_DRAFT', draft: { kind: 'wall', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } })
    expect(s.past.length).toBe(before)
    expect(s.tool).toBe('room')
    expect(s.zoom).toBe(2)
  })
})

describe('reducer — suppression', () => {
  it('supprimer un mur supprime ses ouvertures', () => {
    let s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    s = reducer(s, { type: 'ADD_WALL', wall: { ...wall('w2'), a: { x: 0, y: 3 }, b: { x: 4, y: 3 } } })
    s = reducer(s, { type: 'ADD_OPENING', opening: { id: 'o1', wall_id: 'w1', type: 'door', offset_m: 1, width_m: 0.9, height_m: 2.1, sill_m: 0 } })
    s = reducer(s, { type: 'ADD_OPENING', opening: { id: 'o2', wall_id: 'w2', type: 'window', offset_m: 1, width_m: 1.2, height_m: 1.2, sill_m: 1 } })
    s = reducer(s, { type: 'SELECT', selection: { kind: 'wall', id: 'w1' } })
    s = reducer(s, { type: 'DELETE_SELECTED' })
    expect(s.geometry.walls.map((w) => w.id)).toEqual(['w2'])
    expect(s.geometry.openings.map((o) => o.id)).toEqual(['o2'])
    expect(s.selection).toBeNull()
  })

  it('supprimer une pièce ou une ouverture ne touche qu’elle', () => {
    let s = reducer(s0(), { type: 'ADD_ROOM', room: { id: 'r1', type: 'living', polygon: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }] } })
    s = reducer(s, { type: 'ADD_WALL', wall: wall('w1') })
    s = reducer(s, { type: 'ADD_OPENING', opening: { id: 'o1', wall_id: 'w1', type: 'door', offset_m: 1, width_m: 0.9, height_m: 2.1, sill_m: 0 } })
    s = reducer(s, { type: 'SELECT', selection: { kind: 'room', id: 'r1' } })
    s = reducer(s, { type: 'DELETE_SELECTED' })
    expect(s.geometry.rooms).toHaveLength(0)
    expect(s.geometry.walls).toHaveLength(1)
    s = reducer(s, { type: 'SELECT', selection: { kind: 'opening', id: 'o1' } })
    s = reducer(s, { type: 'DELETE_SELECTED' })
    expect(s.geometry.openings).toHaveLength(0)
    expect(s.geometry.walls).toHaveLength(1)
  })

  it('supprimer sans sélection ne change rien', () => {
    const s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    expect(reducer(s, { type: 'DELETE_SELECTED' })).toBe(s)
  })
})

describe('reducer — REPAIR_GEOMETRY', () => {
  it('supprime les murs sous MIN_WALL_M et leurs ouvertures', () => {
    let s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    s = reducer(s, { type: 'ADD_WALL', wall: { id: 'w2', a: { x: 0, y: 3 }, b: { x: 0, y: 3 }, thickness_m: 0.2 } })
    s = reducer(s, { type: 'ADD_OPENING', opening: { id: 'o1', wall_id: 'w1', type: 'door', offset_m: 1, width_m: 0.9, height_m: 2.1, sill_m: 0 } })
    s = reducer(s, { type: 'ADD_OPENING', opening: { id: 'o2', wall_id: 'w2', type: 'door', offset_m: 0, width_m: 0.9, height_m: 2.1, sill_m: 0 } })
    s = reducer(s, { type: 'SELECT', selection: { kind: 'wall', id: 'w2' } })
    s = reducer(s, { type: 'REPAIR_GEOMETRY' })
    expect(s.geometry.walls.map((w) => w.id)).toEqual(['w1'])
    expect(s.geometry.openings.map((o) => o.id)).toEqual(['o1'])
    expect(s.selection).toBeNull()
  })

  it('ne change rien si aucun mur n’est sous MIN_WALL_M', () => {
    const s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    expect(reducer(s, { type: 'REPAIR_GEOMETRY' })).toBe(s)
  })
})

describe('reducer — édition des éléments', () => {
  it('déplace un sommet de mur et coalesce le glissé dans une seule entrée d’historique', () => {
    let s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    const before = s.past.length
    for (const x of [3.5, 3.2, 3]) {
      s = reducer(s, { type: 'MOVE_VERTEX', ref: { kind: 'wall', id: 'w1', end: 'b' }, point: { x, y: 0 }, dragging: true })
    }
    s = reducer(s, { type: 'END_DRAG' })
    expect(s.geometry.walls[0].b).toEqual({ x: 3, y: 0 })
    expect(s.past.length).toBe(before + 1)
    expect(reducer(s, { type: 'UNDO' }).geometry.walls[0].b).toEqual({ x: 4, y: 0 })
  })

  it('déplace un sommet de polygone de pièce', () => {
    let s = reducer(s0(), { type: 'ADD_ROOM', room: { id: 'r1', type: 'living', polygon: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }] } })
    s = reducer(s, { type: 'MOVE_VERTEX', ref: { kind: 'room', id: 'r1', index: 1 }, point: { x: 2, y: 0.5 } })
    expect(s.geometry.rooms[0].polygon[1]).toEqual({ x: 2, y: 0.5 })
  })

  it('refuse de rendre un mur plus court que le minimum en déplaçant un sommet', () => {
    const wallState = () => ({
      ...initialState(),
      geometry: {
        walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, thickness_m: 0.2 }],
        rooms: [], openings: [],
      },
    })
    const s = reducer(wallState(), {
      type: 'MOVE_VERTEX', ref: { kind: 'wall', id: 'w1', end: 'b' }, point: { x: 0, y: 0 },
    })
    expect(s.geometry.walls[0].b).toEqual({ x: 3, y: 0 })
  })

  it('accepte un déplacement qui laisse le mur au-dessus du minimum', () => {
    const wallState = () => ({
      ...initialState(),
      geometry: {
        walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, thickness_m: 0.2 }],
        rooms: [], openings: [],
      },
    })
    const s = reducer(wallState(), {
      type: 'MOVE_VERTEX', ref: { kind: 'wall', id: 'w1', end: 'b' }, point: { x: 1, y: 0 },
    })
    expect(s.geometry.walls[0].b).toEqual({ x: 1, y: 0 })
    expect(MIN_WALL_M).toBe(0.05)
  })

  it('UPDATE_ELEMENT applique un correctif et SET_ROOM_TYPE change le type', () => {
    let s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    s = reducer(s, { type: 'UPDATE_ELEMENT', kind: 'wall', id: 'w1', patch: { thickness_m: 0.3 } })
    expect(s.geometry.walls[0].thickness_m).toBe(0.3)
    s = reducer(s, { type: 'ADD_ROOM', room: { id: 'r1', type: 'living', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } })
    s = reducer(s, { type: 'SET_ROOM_TYPE', id: 'r1', roomType: 'kitchen' })
    expect(s.geometry.rooms[0].type).toBe('kitchen')
  })

  it('UPDATE_ELEMENT refuse un redimensionnement qui rendrait le mur plus court que MIN_WALL_M', () => {
    let s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') }) // mur de 4 m
    const tooShort = resizedWall(s.geometry.walls[0], MIN_WALL_M - 0.01)
    s = reducer(s, { type: 'UPDATE_ELEMENT', kind: 'wall', id: 'w1', patch: tooShort })
    // Le mur ne change pas car resizedWall a refusé le patch
    expect(s.geometry.walls[0].b).toEqual({ x: 4, y: 0 })
  })

  it('LOAD_GEOMETRY remplace la géométrie et peut réinitialiser l’historique', () => {
    let s = reducer(s0(), { type: 'ADD_WALL', wall: wall('w1') })
    const loaded = { walls: [wall('x1')], rooms: [], openings: [] }
    const undoable = reducer(s, { type: 'LOAD_GEOMETRY', geometry: loaded })
    expect(undoable.geometry.walls[0].id).toBe('x1')
    expect(reducer(undoable, { type: 'UNDO' }).geometry.walls[0].id).toBe('w1')

    const reset = reducer(s, { type: 'LOAD_GEOMETRY', geometry: loaded, resetHistory: true })
    expect(reset.past).toHaveLength(0)
    expect(reset.future).toHaveLength(0)
    expect(reset.selection).toBeNull()
  })
})

describe('resizedWall', () => {
  it('change la longueur en gardant l’origine et la direction', () => {
    const w = resizedWall(wall('w1'), 2)
    expect(w.a).toEqual({ x: 0, y: 0 })
    expect(w.b.x).toBeCloseTo(2)
    expect(w.b.y).toBeCloseTo(0)
  })

  it('ignore une longueur non positive ou un mur dégénéré', () => {
    const w = wall('w1')
    expect(resizedWall(w, 0)).toBe(w)
    const degenerate = { id: 'w', a: { x: 1, y: 1 }, b: { x: 1, y: 1 }, thickness_m: 0.2 }
    expect(resizedWall(degenerate, 3)).toBe(degenerate)
  })

  it('refuse une longueur plus courte que MIN_WALL_M', () => {
    const w = wall('w1') // longueur 4 m
    expect(resizedWall(w, MIN_WALL_M - 0.01)).toBe(w)
    expect(resizedWall(w, MIN_WALL_M)).not.toBe(w)
    expect(resizedWall(w, 0.1)).not.toBe(w)
  })
})

describe('hitTest', () => {
  const geometry = {
    walls: [wall('w1')],
    rooms: [{ id: 'r1', type: 'living', polygon: [{ x: 0, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 5 }, { x: 0, y: 5 }] }],
    openings: [{ id: 'o1', wall_id: 'w1', type: 'door', offset_m: 2, width_m: 0.9, height_m: 2.1, sill_m: 0 }],
  }

  it('trouve l’ouverture avant le mur qui la porte', () => {
    expect(hitTest(geometry, { x: 2, y: 0.05 }, 0.3)).toEqual({ kind: 'opening', id: 'o1' })
  })

  it('trouve un mur à portée puis une pièce par son intérieur', () => {
    expect(hitTest(geometry, { x: 0.5, y: 0.1 }, 0.3)).toEqual({ kind: 'wall', id: 'w1' })
    expect(hitTest(geometry, { x: 2, y: 3.5 }, 0.3)).toEqual({ kind: 'room', id: 'r1' })
  })

  it('ne trouve rien hors de portée', () => {
    expect(hitTest(geometry, { x: 20, y: 20 }, 0.3)).toBeNull()
  })
})

describe('SELECT_AREA — sélection multiple par rectangle', () => {
  const grid = {
    walls: [
      { id: 'in', a: { x: 1, y: 1 }, b: { x: 2, y: 1 }, thickness_m: 0.2 },
      { id: 'half', a: { x: 1, y: 1 }, b: { x: 9, y: 1 }, thickness_m: 0.2 },
    ],
    rooms: [{ id: 'r', type: 'living', polygon: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
    openings: [{ id: 'o', wall_id: 'in', type: 'door', offset_m: 0.1, width_m: 0.5 }],
  }

  it('ne prend que les objets entièrement contenus dans le rectangle', () => {
    const s = reducer({ ...initialState(), geometry: grid }, {
      type: 'SELECT_AREA', rect: { x1: 0, y1: 0, x2: 3, y2: 3 },
    })
    expect(selectionItems(s.selection)).toEqual([
      { kind: 'wall', id: 'in' },
      { kind: 'room', id: 'r' },
    ])
  })

  it('supprime toute la sélection, ouvertures des murs comprises', () => {
    let s = reducer({ ...initialState(), geometry: grid }, {
      type: 'SELECT_AREA', rect: { x1: 0, y1: 0, x2: 3, y2: 3 },
    })
    s = reducer(s, { type: 'DELETE_SELECTED' })
    expect(s.geometry.walls.map((w) => w.id)).toEqual(['half'])
    expect(s.geometry.openings).toEqual([])
    expect(s.geometry.rooms).toEqual([])
  })

  it('laisse la sélection unique strictement inchangée', () => {
    const s = reducer({ ...initialState(), geometry: grid }, {
      type: 'SELECT', selection: { kind: 'wall', id: 'in' },
    })
    expect(s.selection).toEqual({ kind: 'wall', id: 'in' })
  })

  it('ne sélectionne rien quand le rectangle ne contient aucun objet entier', () => {
    const s = reducer({ ...initialState(), geometry: grid }, {
      type: 'SELECT_AREA', rect: { x1: 20, y1: 20, x2: 21, y2: 21 },
    })
    expect(s.selection).toBeNull()
  })

  it('translate toute la sélection sans changer les longueurs', () => {
    let s = reducer({ ...initialState(), geometry: grid }, {
      type: 'SELECT_AREA', rect: { x1: 0, y1: 0, x2: 3, y2: 3 },
    })
    const before = wallLength(s.geometry.walls.find((w) => w.id === 'in'))
    s = reducer(s, { type: 'MOVE_SELECTION', delta: { x: 5, y: 0 } })
    const moved = s.geometry.walls.find((w) => w.id === 'in')
    expect(moved.a).toEqual({ x: 6, y: 1 })
    expect(wallLength(moved)).toBeCloseTo(before, 10)
    expect(s.geometry.walls.find((w) => w.id === 'half').a).toEqual({ x: 1, y: 1 })
  })

  it('laisse les ouvertures suivre leur mur sans traitement', () => {
    let s = reducer({ ...initialState(), geometry: grid }, {
      type: 'SELECT_AREA', rect: { x1: 0, y1: 0, x2: 3, y2: 3 },
    })
    s = reducer(s, { type: 'MOVE_SELECTION', delta: { x: 5, y: 0 } })
    expect(s.geometry.openings[0]).toEqual(grid.openings[0])
  })

  it('ne fait rien — ni géométrie ni historique — pour une sélection sans mur ni pièce', () => {
    const s0 = reducer({ ...initialState(), geometry: grid }, {
      type: 'SELECT', selection: { kind: 'opening', id: 'o' },
    })
    const s = reducer(s0, { type: 'MOVE_SELECTION', delta: { x: 5, y: 0 } })
    expect(s.geometry).toBe(s0.geometry)
    expect(s.past.length).toBe(s0.past.length)
  })
})
