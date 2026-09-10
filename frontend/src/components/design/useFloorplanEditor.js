import { useCallback, useMemo, useReducer } from 'react'
import { dist, projectPointOnWall, wallLength } from '../../utils/floorplan'

/**
 * Cœur logique de l'éditeur de plan : un réducteur pur (aucun DOM, aucun réseau)
 * qui tient la géométrie en cours d'édition, l'outil courant, la sélection, le
 * brouillon de tracé, la vue (zoom/pan) et la pile annuler/refaire.
 *
 * Séparation volontaire : la géométrie « métier » (accrochage, aires, validation)
 * vit dans utils/floorplan.js ; ici on ne fait qu'assembler des états. Tout ce qui
 * touche au pointeur, au SVG ou à IndexedDB est en dehors — c'est ce qui rend ce
 * fichier testable sans jsdom.
 *
 * Convention d'historique : `past` et `future` ne contiennent QUE des géométries
 * (pas l'état complet). Annuler ne doit pas remettre l'outil, le zoom ou la
 * sélection dans un état passé — l'utilisateur annule son tracé, pas sa caméra.
 */

export const HISTORY_MAX = 50

export const DEFAULT_WALL_THICKNESS_M = 0.2
export const MIN_WALL_M = 0.05
export const OPENING_DEFAULTS = {
  door: { width_m: 0.9, height_m: 2.1, sill_m: 0 },
  window: { width_m: 1.2, height_m: 1.2, sill_m: 1 },
}

export const TOOLS = ['select', 'wall', 'room', 'door', 'window']

const EMPTY = { walls: [], rooms: [], openings: [] }

export function initialState({ geometry, tool = 'select', zoom = 1, pan = { x: 0, y: 0 } } = {}) {
  return {
    geometry: geometry ? { ...EMPTY, ...geometry } : { ...EMPTY },
    tool,
    selection: null,
    draft: null,
    zoom,
    pan,
    dragging: false,
    grid: { step: 0.5, visible: true },
    snap: { grid: true, points: true, angle: true },
    dimensions: true,
    past: [],
    future: [],
  }
}

// Nouvelle géométrie + entrée d'historique. `push: false` sert au glissé continu :
// un déplacement de sommet ne doit produire qu'UNE entrée annulable, pas une par
// événement de pointeur.
function withGeometry(state, geometry, push = true) {
  if (!push) return { ...state, geometry }
  const past = [...state.past, state.geometry]
  return {
    ...state,
    geometry,
    past: past.length > HISTORY_MAX ? past.slice(past.length - HISTORY_MAX) : past,
    future: [],
  }
}

const listOf = (g, kind) => g[kind === 'wall' ? 'walls' : kind === 'room' ? 'rooms' : 'openings'] || []
const keyOf = (kind) => (kind === 'wall' ? 'walls' : kind === 'room' ? 'rooms' : 'openings')

// Longueur d'un mur imposée depuis le panneau (saisie au pavé numérique) : on
// garde l'origine et la direction, seule l'extrémité b bouge.
export function resizedWall(w, lengthM) {
  const len = wallLength(w)
  if (!(lengthM > 0) || !(len > 0) || lengthM < MIN_WALL_M) return w
  const k = lengthM / len
  return { ...w, b: { x: w.a.x + (w.b.x - w.a.x) * k, y: w.a.y + (w.b.y - w.a.y) * k } }
}

// Centre et emprise d'une ouverture, en mètres, le long de son mur.
export function openingSpan(opening, wall) {
  if (!wall) return null
  const len = wallLength(wall)
  if (!(len > 0)) return null
  const ux = (wall.b.x - wall.a.x) / len
  const uy = (wall.b.y - wall.a.y) / len
  const from = Math.max(0, Math.min(len, opening.offset_m))
  const to = Math.max(0, Math.min(len, opening.offset_m + opening.width_m))
  return {
    a: { x: wall.a.x + ux * from, y: wall.a.y + uy * from },
    b: { x: wall.a.x + ux * to, y: wall.a.y + uy * to },
    u: { x: ux, y: uy },
  }
}

function pointInPolygon(p, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * Élément sous le doigt. `tolerance` est un rayon EN MÈTRES : l'appelant le
 * calcule depuis le zoom pour garantir une cible d'au moins 44 px à l'écran.
 * Priorité : ouvertures (petites, posées sur un mur) > murs > pièces (surface).
 */
export function hitTest(geometry, p, tolerance) {
  const walls = geometry.walls || []
  let best = null
  let bestD = tolerance
  for (const o of geometry.openings || []) {
    const span = openingSpan(o, walls.find((w) => w.id === o.wall_id))
    if (!span) continue
    const d = projectPointOnWall(p, span).distance
    if (d <= bestD) {
      best = { kind: 'opening', id: o.id }
      bestD = d
    }
  }
  if (best) return best
  bestD = tolerance
  for (const w of walls) {
    const d = projectPointOnWall(p, w).distance
    if (d <= bestD) {
      best = { kind: 'wall', id: w.id }
      bestD = d
    }
  }
  if (best) return best
  for (const r of geometry.rooms || []) {
    if ((r.polygon || []).length >= 3 && pointInPolygon(p, r.polygon)) return { kind: 'room', id: r.id }
  }
  return null
}

// Poignée de sommet la plus proche (extrémités de murs, sommets de polygones).
export function hitVertex(geometry, p, tolerance) {
  let best = null
  let bestD = tolerance
  for (const w of geometry.walls || []) {
    for (const end of ['a', 'b']) {
      const d = dist(p, w[end])
      if (d <= bestD) {
        best = { kind: 'wall', id: w.id, end }
        bestD = d
      }
    }
  }
  for (const r of geometry.rooms || []) {
    const poly = r.polygon || []
    poly.forEach((q, index) => {
      const d = dist(p, q)
      if (d <= bestD) {
        best = { kind: 'room', id: r.id, index }
        bestD = d
      }
    })
  }
  return best
}

// Longueur minimale d'un mur, en mètres. Vaut à la création comme au déplacement de
// sommet : un mur de longueur nulle est refusé par le serveur, donc un niveau qui en
// contient un ne peut plus jamais être synchronisé.
function moveVertex(geometry, ref, point) {
  if (ref.kind === 'wall') {
    return {
      ...geometry,
      walls: geometry.walls.map((w) => {
        if (w.id !== ref.id) return w
        const moved = { ...w, [ref.end]: { x: point.x, y: point.y } }
        return wallLength(moved) < MIN_WALL_M ? w : moved
      }),
    }
  }
  return {
    ...geometry,
    rooms: geometry.rooms.map((r) =>
      r.id === ref.id ? { ...r, polygon: r.polygon.map((q, i) => (i === ref.index ? { x: point.x, y: point.y } : q)) } : r,
    ),
  }
}

function deleteSelected(geometry, selection) {
  const { kind, id } = selection
  if (kind === 'wall') {
    return {
      ...geometry,
      walls: geometry.walls.filter((w) => w.id !== id),
      // Une ouverture n'existe que portée par un mur : la garder produirait une
      // géométrie que le serveur refuse (« mur introuvable »).
      openings: (geometry.openings || []).filter((o) => o.wall_id !== id),
    }
  }
  const key = keyOf(kind)
  return { ...geometry, [key]: listOf(geometry, kind).filter((e) => e.id !== id) }
}

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_TOOL':
      // Changer d'outil abandonne un tracé en cours : le brouillon d'un outil
      // n'a aucun sens pour le suivant.
      return { ...state, tool: action.tool, draft: null, selection: action.tool === 'select' ? state.selection : null }

    case 'SELECT':
      return { ...state, selection: action.selection ?? null }

    case 'SET_DRAFT':
      return { ...state, draft: action.draft ?? null }

    case 'SET_VIEW':
      return { ...state, ...action.view }

    case 'SET_OPTION':
      return { ...state, [action.key]: action.value }

    case 'ADD_WALL':
      return withGeometry({ ...state, draft: null }, { ...state.geometry, walls: [...state.geometry.walls, action.wall] })

    case 'ADD_ROOM':
      return withGeometry({ ...state, draft: null }, { ...state.geometry, rooms: [...state.geometry.rooms, action.room] })

    case 'ADD_OPENING':
      return withGeometry({ ...state, draft: null }, { ...state.geometry, openings: [...state.geometry.openings, action.opening] })

    case 'MOVE_VERTEX': {
      const geometry = moveVertex(state.geometry, action.ref, action.point)
      const continuing = action.dragging && state.dragging
      return { ...withGeometry(state, geometry, !continuing), dragging: !!action.dragging }
    }

    case 'END_DRAG':
      return state.dragging ? { ...state, dragging: false } : state

    case 'UPDATE_ELEMENT': {
      const key = keyOf(action.kind)
      const list = listOf(state.geometry, action.kind)
      if (!list.some((e) => e.id === action.id)) return state
      const next = list.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e))
      return withGeometry(state, { ...state.geometry, [key]: next }, !action.dragging || !state.dragging)
    }

    case 'SET_ROOM_TYPE':
      return withGeometry(state, {
        ...state.geometry,
        rooms: state.geometry.rooms.map((r) => (r.id === action.id ? { ...r, type: action.roomType } : r)),
      })

    case 'DELETE_SELECTED': {
      if (!state.selection) return state
      const geometry = deleteSelected(state.geometry, state.selection)
      return { ...withGeometry(state, geometry), selection: null }
    }

    // Répare les murs sous MIN_WALL_M (dégénérés, refusés par le serveur) en les
    // supprimant avec leurs ouvertures — même geste que DELETE_SELECTED sur un mur,
    // mais déclenché depuis le bandeau des problèmes plutôt qu'une sélection.
    case 'REPAIR_GEOMETRY': {
      const keep = state.geometry.walls.filter((w) => wallLength(w) >= MIN_WALL_M)
      if (keep.length === state.geometry.walls.length) return state
      const ids = new Set(keep.map((w) => w.id))
      const geometry = {
        ...state.geometry,
        walls: keep,
        openings: (state.geometry.openings || []).filter((o) => ids.has(o.wall_id)),
      }
      return { ...withGeometry(state, geometry), selection: null }
    }

    case 'LOAD_GEOMETRY': {
      const geometry = { ...EMPTY, ...action.geometry }
      // `resetHistory` : chargement initial d'un niveau (on n'annule pas
      // « l'ouverture du plan »). Sans lui — reprise d'une version mise de côté,
      // par exemple — le remplacement reste annulable.
      if (action.resetHistory) return { ...state, geometry, selection: null, draft: null, past: [], future: [] }
      return { ...withGeometry(state, geometry), selection: null, draft: null }
    }

    case 'UNDO': {
      if (!state.past.length) return state
      const geometry = state.past[state.past.length - 1]
      return {
        ...state,
        geometry,
        past: state.past.slice(0, -1),
        future: [state.geometry, ...state.future],
        selection: null,
        draft: null,
      }
    }

    case 'REDO': {
      if (!state.future.length) return state
      const [geometry, ...rest] = state.future
      return {
        ...state,
        geometry,
        past: [...state.past, state.geometry],
        future: rest,
        selection: null,
        draft: null,
      }
    }

    default:
      return state
  }
}

export function useFloorplanEditor(initial) {
  const [state, dispatch] = useReducer(reducer, initial, initialState)
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])
  return useMemo(
    () => ({ state, dispatch, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 }),
    [state, undo, redo],
  )
}

export default useFloorplanEditor
