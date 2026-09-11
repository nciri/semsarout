import { describe, it, expect } from 'vitest'
import {
  polygonArea, wallLength, snapToGrid, snapToPoints, snapAngle, projectPointOnWall,
  normalizedToMeters, metersToNormalized, rescaleGeometry, validateGeometry, geometryProblems, levelArea, bbox, newId,
  copyGeometry,
} from './floorplan'

const W = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, thickness_m: 0.2 }

describe('floorplan geometry', () => {
  it('newId is 32 hex chars', () => expect(newId()).toMatch(/^[0-9a-f]{32}$/))

  it('wallLength', () => expect(wallLength({ a: { x: 0, y: 0 }, b: { x: 3, y: 4 } })).toBe(5))

  it('polygonArea square and concave', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(12)
    expect(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 2, y: 2 }, { x: 0, y: 4 }])).toBe(12)
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(0)
  })

  it('levelArea sums rooms', () => {
    const g = { walls: [], openings: [], rooms: [
      { id: 'r1', type: 'living', name: 'S', polygon: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }] },
      { id: 'r2', type: 'wc', name: 'W', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }] }
    expect(levelArea(g)).toBe(5)
  })

  it('snapToGrid', () => expect(snapToGrid({ x: 1.26, y: 0.74 }, 0.5)).toEqual({ x: 1.5, y: 0.5 }))

  it('snapToPoints within tolerance only', () => {
    expect(snapToPoints({ x: 4.05, y: 0.02 }, [W.a, W.b], 0.15)).toEqual(W.b)
    expect(snapToPoints({ x: 3, y: 1 }, [W.a, W.b], 0.15)).toEqual({ x: 3, y: 1 })
  })

  it('snapAngle rounds to 45° when enabled', () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 3, y: 0.4 }, true)
    expect(p.y).toBeCloseTo(0, 6)
    const q = snapAngle({ x: 0, y: 0 }, { x: 2, y: 2.3 }, true)
    expect(q.x).toBeCloseTo(q.y, 6)
    expect(snapAngle({ x: 0, y: 0 }, { x: 3, y: 0.4 }, false)).toEqual({ x: 3, y: 0.4 })
  })

  it('projectPointOnWall clamps and measures distance', () => {
    expect(projectPointOnWall({ x: 1, y: 0.3 }, W)).toMatchObject({ offset_m: 1, distance: 0.3 })
    expect(projectPointOnWall({ x: 9, y: 0 }, W).offset_m).toBe(4)
    expect(projectPointOnWall({ x: -2, y: 0 }, W).offset_m).toBe(0)
  })

  it('calibration round-trips with non-square image', () => {
    // origine = coin haut-gauche de l'image. cal.p1/p2 servent uniquement à calculer l'échelle.
    const cal = { p1: { x: 0.1, y: 0.5 }, p2: { x: 0.5, y: 0.5 }, meters: 4 } // dx=0.4, dy=0 -> Wm=10, Hm=5
    const aspect = 2 // image 2x plus large que haute
    const m = normalizedToMeters({ x: 0.5, y: 0.75 }, cal, aspect)
    expect(m.x).toBeCloseTo(5, 6)     // 0.5 * Wm(10) = 5
    expect(m.y).toBeCloseTo(3.75, 6)  // 0.75 * Hm(5) = 3.75
    expect(metersToNormalized(m, cal, aspect)).toEqual({ x: 0.5, y: 0.75 })
  })

  it("rescaleGeometry tolère les champs absents, comme le serveur (miroir)", () => {
    // `app/geometry.py::rescale` renvoie désormais un point ou une ouverture
    // incomplets TELS QUELS (B3) : `validate_geometry` fait défaut `offset_m` à
    // 0, donc la géométrie stockée peut légitimement en être dépourvue. Le
    // miroir client, lui, faisait `o.offset_m * factor` — soit `NaN`, sérialisé
    // `null`, que le serveur rejette ensuite en 422 sur un champ que l'agent
    // n'a jamais touché. Et `scalePoint(w.a)` levait sur un mur sans `a`.
    const g = rescaleGeometry({
      walls: [{ id: 'w1', b: { x: 3, y: 0 }, thickness_m: 0.2 }],
      rooms: [{ id: 'r1' }],
      openings: [{ id: 'o1', wall_id: 'w1', type: 'door', width_m: 0.9 }],
    }, 2)
    expect(g.openings[0].offset_m).toBeUndefined()
    expect(g.walls[0].a).toBeUndefined()
    expect(g.walls[0].b).toEqual({ x: 6, y: 0 })
    expect(g.rooms[0]).toEqual({ id: 'r1' })
  })

  it('rescaleGeometry mirrors server (positions/offset only, not real dimensions)', () => {
    const g = rescaleGeometry({ walls: [W], rooms: [], openings: [{ id: 'o', wall_id: 'w1', type: 'door', offset_m: 1, width_m: 0.9, height_m: 2.1, sill_m: 0 }] }, 2)
    expect(g.walls[0].b).toEqual({ x: 8, y: 0 })
    expect(g.walls[0].thickness_m).toBe(0.2)
    expect(g.openings[0]).toMatchObject({ offset_m: 2, width_m: 0.9, height_m: 2.1, sill_m: 0 })
  })

  it('validateGeometry mirrors server rules', () => {
    expect(validateGeometry({ walls: [W], rooms: [], openings: [] }, 2.7)).toEqual([])
    expect(validateGeometry({ walls: [{ ...W, b: { x: 0, y: 0 } }], rooms: [], openings: [] }, 2.7).length).toBe(1)
    expect(validateGeometry({ walls: [W], rooms: [], openings: [{ id: 'o', wall_id: 'w1', type: 'door', offset_m: 3.5, width_m: 0.9, height_m: 2.1, sill_m: 0 }] }, 2.7).length).toBe(1)
    expect(validateGeometry({ walls: [W], rooms: [], openings: [{ id: 'o', wall_id: 'w1', type: 'window', offset_m: 1, width_m: 1, height_m: 2, sill_m: 1 }] }, 2.7).length).toBe(1)
  })

  it('bbox', () => expect(bbox({ walls: [W], rooms: [], openings: [] })).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 0 }))

  describe('validateGeometry hardening (miroir de schemas.py::validate_geometry)', () => {
    it('never throws, always returns an array, on absurd input', () => {
      expect(() => validateGeometry(null, 2.7)).not.toThrow()
      expect(() => validateGeometry(undefined, 2.7)).not.toThrow()
      expect(() => validateGeometry('nope', 2.7)).not.toThrow()
      expect(() => validateGeometry(42, 2.7)).not.toThrow()
      expect(() => validateGeometry([], 2.7)).not.toThrow()
      expect(Array.isArray(validateGeometry(null, 2.7))).toBe(true)
    })

    it('rejects a non-object geometry', () => {
      expect(validateGeometry(null, 2.7)).toEqual(['geometry doit être un objet'])
      expect(validateGeometry('x', 2.7)).toEqual(['geometry doit être un objet'])
      expect(validateGeometry([], 2.7)).toEqual(['geometry doit être un objet'])
    })

    it('rejects a non-finite wallHeightM', () => {
      expect(validateGeometry({ walls: [], rooms: [], openings: [] }, NaN)).toEqual(['wall_height_m invalide'])
      expect(validateGeometry({ walls: [], rooms: [], openings: [] }, Infinity)).toEqual(['wall_height_m invalide'])
      expect(validateGeometry({ walls: [], rooms: [], openings: [] }, '2.7')).toEqual(['wall_height_m invalide'])
    })

    it('rejects a collection that is not an array', () => {
      expect(validateGeometry({ walls: 'nope', rooms: [], openings: [] }, 2.7).length).toBeGreaterThan(0)
      expect(validateGeometry({ walls: [], rooms: { a: 1 }, openings: [] }, 2.7).length).toBeGreaterThan(0)
      expect(validateGeometry({ walls: [], rooms: [], openings: 5 }, 2.7).length).toBeGreaterThan(0)
    })

    it('rejects a non-object element inside a collection', () => {
      expect(validateGeometry({ walls: [null], rooms: [], openings: [] }, 2.7).length).toBeGreaterThan(0)
      expect(validateGeometry({ walls: [], rooms: ['not-an-object'], openings: [] }, 2.7).length).toBeGreaterThan(0)
      expect(validateGeometry({ walls: [], rooms: [], openings: [42] }, 2.7).length).toBeGreaterThan(0)
    })

    it('rejects a NaN or Infinite wall coordinate', () => {
      expect(validateGeometry({ walls: [{ ...W, b: { x: NaN, y: 0 } }], rooms: [], openings: [] }, 2.7).length).toBeGreaterThan(0)
      expect(validateGeometry({ walls: [{ ...W, b: { x: Infinity, y: 0 } }], rooms: [], openings: [] }, 2.7).length).toBeGreaterThan(0)
    })

    it('rejects a NaN thickness_m', () => {
      expect(validateGeometry({ walls: [{ ...W, thickness_m: NaN }], rooms: [], openings: [] }, 2.7).length).toBe(1)
    })

    it('rejects a NaN or Infinite opening dimension', () => {
      const base = { id: 'o', wall_id: 'w1', type: 'door', offset_m: 1, width_m: 0.9, height_m: 2.1, sill_m: 0 }
      expect(validateGeometry({ walls: [W], rooms: [], openings: [{ ...base, width_m: NaN }] }, 2.7).length).toBeGreaterThan(0)
      expect(validateGeometry({ walls: [W], rooms: [], openings: [{ ...base, offset_m: Infinity }] }, 2.7).length).toBeGreaterThan(0)
    })

    it('rejects duplicate ids for each collection', () => {
      expect(validateGeometry({ walls: [W, { ...W }], rooms: [], openings: [] }, 2.7).length).toBeGreaterThan(0)
      const room = { id: 'r1', type: 'living', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }
      expect(validateGeometry({ walls: [], rooms: [room, { ...room }], openings: [] }, 2.7).length).toBeGreaterThan(0)
      const opening = { id: 'o1', wall_id: 'w1', type: 'door', offset_m: 0, width_m: 0.9, height_m: 2.1, sill_m: 0 }
      expect(validateGeometry({ walls: [W], rooms: [], openings: [opening, { ...opening }] }, 2.7).length).toBeGreaterThan(0)
    })

    it('rejects a missing or empty id', () => {
      expect(validateGeometry({ walls: [{ ...W, id: '' }], rooms: [], openings: [] }, 2.7).length).toBeGreaterThan(0)
      expect(validateGeometry({ walls: [{ ...W, id: undefined }], rooms: [], openings: [] }, 2.7).length).toBeGreaterThan(0)
    })

    it('rejects an invalid opening type', () => {
      expect(validateGeometry({ walls: [W], rooms: [], openings: [{ id: 'o', wall_id: 'w1', type: 'garage-door', offset_m: 1, width_m: 0.9, height_m: 2.1, sill_m: 0 }] }, 2.7).length).toBeGreaterThan(0)
    })

    it('rejects invalid opening dimensions (negative width, negative offset)', () => {
      expect(validateGeometry({ walls: [W], rooms: [], openings: [{ id: 'o', wall_id: 'w1', type: 'door', offset_m: 1, width_m: -0.5, height_m: 2.1, sill_m: 0 }] }, 2.7).length).toBeGreaterThan(0)
      expect(validateGeometry({ walls: [W], rooms: [], openings: [{ id: 'o', wall_id: 'w1', type: 'door', offset_m: -1, width_m: 0.9, height_m: 2.1, sill_m: 0 }] }, 2.7).length).toBeGreaterThan(0)
    })
  })

  describe('geometryProblems (validation structurée)', () => {
    const degenerate = {
      walls: [{ id: 'W1', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, thickness_m: 0.2 }],
      openings: [{ id: 'O1', wall_id: 'W1', type: 'door', offset_m: 1, width_m: 0.9 }],
      rooms: [],
    }

    it('signale la cause et marque la conséquence comme dérivée', () => {
      expect(geometryProblems(degenerate, 2.7)).toEqual([
        { code: 'wall_too_short', kind: 'wall', id: 'W1', derived: false },
        { code: 'opening_orphan', kind: 'opening', id: 'O1', derived: true },
      ])
    })

    it('garde le miroir exact du serveur, conséquence incluse', () => {
      expect(validateGeometry(degenerate, 2.7)).toEqual([
        'mur W1: deux points distincts requis',
        'ouverture O1: mur introuvable',
      ])
    })
  })

  describe('copyGeometry', () => {
    it('régénère les identifiants et préserve le lien ouverture → mur', () => {
      const src = {
        walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, thickness_m: 0.2 }],
        openings: [{ id: 'o1', wall_id: 'w1', type: 'door', offset_m: 1, width_m: 0.9 }],
        rooms: [{ id: 'r1', type: 'living', polygon: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }] }],
      }
      const out = copyGeometry(src)
      expect(out.walls[0].id).not.toBe('w1')
      expect(out.openings[0].wall_id).toBe(out.walls[0].id)
      expect(out.walls[0].a).toEqual({ x: 0, y: 0 })
      expect(out.rooms[0].id).not.toBe('r1')
      expect(src.walls[0].id).toBe('w1')
    })

    it('écarte une ouverture dont le mur ne fait pas partie de la copie', () => {
      const out = copyGeometry({ walls: [], rooms: [], openings: [{ id: 'o', wall_id: 'absent' }] })
      expect(out.openings).toEqual([])
    })

    it('ne partage aucun point ni polygone par référence avec la source', () => {
      const src = {
        walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, thickness_m: 0.2 }],
        rooms: [{ id: 'r1', type: 'living', polygon: [{ x: 0, y: 0 }, { x: 3, y: 0 }] }],
        openings: [],
      }
      const out = copyGeometry(src)
      expect(out.walls[0].a).not.toBe(src.walls[0].a)
      expect(out.walls[0].b).not.toBe(src.walls[0].b)
      expect(out.rooms[0].polygon).not.toBe(src.rooms[0].polygon)
      expect(out.rooms[0].polygon[0]).not.toBe(src.rooms[0].polygon[0])
    })
  })
})
