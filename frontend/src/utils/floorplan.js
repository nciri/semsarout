/**
 * Géométrie pure de l'éditeur de plan (mètres). Miroir de services/design3d/app/schemas.py
 * (validateGeometry / validate_geometry) et app/geometry.py (rescaleGeometry / rescale) :
 * toute règle changée d'un côté doit l'être de l'autre.
 *
 * Repère : origine = coin haut-gauche de l'image de fond (ou de la grille), x → droite, y → bas,
 * unités en mètres. Aucune fonction ici ne touche au DOM ; tout est testable sans jsdom.
 *
 * Calibration : l'agent pointe deux points {p1, p2} en coordonnées normalisées (0-1, relatives
 * aux dimensions de l'image) et saisit `meters`, la longueur réelle du segment p1-p2. L'axe y
 * normalisé est comprimé du ratio largeur/hauteur de l'image (`aspect`), donc la distance entre
 * p1 et p2 en unités « largeur d'image » vaut hypot(dx, dy/aspect) avec dx = p2.x-p1.x,
 * dy = p2.y-p1.y. On en déduit la largeur de l'image en mètres Wm = meters / hypot(dx, dy/aspect)
 * et sa hauteur Hm = Wm / aspect. Un point normalisé {x, y} (origine = coin haut-gauche de
 * l'image, pas p1) vaut alors {x: x*Wm, y: y*Hm} en mètres.
 */

export const ROOM_TYPES = ['living', 'bedroom', 'kitchen', 'bathroom', 'wc', 'hallway', 'balcony', 'garage', 'other']
export const OPENING_TYPES = ['door', 'window']
export const EMPTY_GEOMETRY = { walls: [], rooms: [], openings: [] }

const MAX_GEOMETRY_BYTES = 512 * 1024

export const newId = () => crypto.randomUUID().replace(/-/g, '')

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

export const wallLength = (w) => dist(w.a, w.b)

export function polygonArea(poly) {
  if (!poly || poly.length < 3) return 0
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return Math.abs(s) / 2
}

export const levelArea = (g) => (g.rooms || []).reduce((acc, r) => acc + polygonArea(r.polygon), 0)

export const snapToGrid = (p, step) => ({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step })

export function snapToPoints(p, points, tolerance) {
  let best = null
  let bestD = tolerance
  for (const q of points) {
    const d = dist(p, q)
    if (d <= bestD) {
      best = q
      bestD = d
    }
  }
  return best ? { x: best.x, y: best.y } : p
}

export function snapAngle(origin, p, enabled) {
  if (!enabled) return p
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return p
  const step = Math.PI / 4
  const ang = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: origin.x + Math.cos(ang) * len, y: origin.y + Math.sin(ang) * len }
}

export function projectPointOnWall(p, wall) {
  const { a, b } = wall
  const len = dist(a, b)
  if (len === 0) return { offset_m: 0, distance: dist(p, a), point: { ...a } }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)))
  const point = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
  return { offset_m: t * len, distance: dist(p, point), point }
}

function imageMetersFromCalibration(cal, aspect) {
  const dx = cal.p2.x - cal.p1.x
  const dy = (cal.p2.y - cal.p1.y) / aspect
  const widthM = cal.meters / Math.hypot(dx, dy)
  return { widthM, heightM: widthM / aspect }
}

export function normalizedToMeters(pNorm, calibration, imageAspect) {
  const { widthM, heightM } = imageMetersFromCalibration(calibration, imageAspect)
  return { x: pNorm.x * widthM, y: pNorm.y * heightM }
}

export function metersToNormalized(pM, calibration, imageAspect) {
  const { widthM, heightM } = imageMetersFromCalibration(calibration, imageAspect)
  return { x: pM.x / widthM, y: pM.y / heightM }
}

const scalePoint = (p, factor) => ({ x: p.x * factor, y: p.y * factor })

// Miroir exact de app/geometry.py::rescale : seules les positions (points de murs, sommets de
// polygones) et offset_m sont mises à l'échelle. thickness_m, width_m, height_m et sill_m sont
// des dimensions réelles saisies par l'agent — elles ne changent jamais avec la calibration.
export const rescaleGeometry = (geometry, factor) => ({
  walls: (geometry.walls || []).map((w) => ({ ...w, a: scalePoint(w.a, factor), b: scalePoint(w.b, factor) })),
  rooms: (geometry.rooms || []).map((r) => ({ ...r, polygon: (r.polygon || []).map((p) => scalePoint(p, factor)) })),
  openings: (geometry.openings || []).map((o) => ({ ...o, offset_m: o.offset_m * factor })),
})

export function bbox(geometry) {
  const pts = [
    ...(geometry.walls || []).flatMap((w) => [w.a, w.b]),
    ...(geometry.rooms || []).flatMap((r) => r.polygon || []),
  ]
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  }
}

// --- validateGeometry : miroir exact de app/schemas.py::validate_geometry ---
// Aucune entrée (même absurde) ne doit lever d'exception : uniquement des gardes numériques,
// jamais de try/catch défensif — le comportement observable doit être identique au serveur,
// pas sa forme interne.

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

const isPoint = (p) => isPlainObject(p) && isFiniteNumber(p.x) && isFiniteNumber(p.y)

export function validateGeometry(geometry, wallHeightM) {
  const errors = []

  if (!isPlainObject(geometry)) return ['geometry doit être un objet']

  if (JSON.stringify(geometry).length > MAX_GEOMETRY_BYTES) errors.push('geometry dépasse 512 Ko')

  if (!isFiniteNumber(wallHeightM)) {
    errors.push('wall_height_m invalide')
    return errors
  }

  const collect = (raw, name) => {
    if (raw != null && !Array.isArray(raw)) {
      errors.push(`${name}: liste attendue`)
      return []
    }
    return raw || []
  }
  const walls = collect(geometry.walls, 'walls')
  const rooms = collect(geometry.rooms, 'rooms')
  const openings = collect(geometry.openings, 'openings')

  for (const [coll, name] of [[walls, 'walls'], [rooms, 'rooms'], [openings, 'openings']]) {
    const ids = []
    for (let idx = 0; idx < coll.length; idx++) {
      const e = coll[idx]
      if (!isPlainObject(e)) {
        errors.push(`${name}[${idx}]: objet attendu`)
        continue
      }
      const eId = e.id
      if (!eId) {
        errors.push(`${name}: identifiants manquants ou en double`)
        break
      }
      ids.push(eId)
    }
    if (ids.length && ids.length !== new Set(ids).size) {
      errors.push(`${name}: identifiants manquants ou en double`)
    }
  }

  const byId = {}
  for (const w of walls) {
    if (!isPlainObject(w)) continue // erreur déjà enregistrée ci-dessus

    const wId = w.id
    if (!isPoint(w.a) || !isPoint(w.b)) {
      errors.push(`mur ${wId}: deux points distincts requis`)
      continue
    }
    if (!(wallLength(w) > 0)) {
      errors.push(`mur ${wId}: deux points distincts requis`)
      continue
    }
    const t = w.thickness_m
    if (!isFiniteNumber(t) || !(t > 0 && t <= 1)) errors.push(`mur ${wId}: thickness_m dans ]0, 1]`)
    byId[wId] = w
  }

  for (const r of rooms) {
    if (!isPlainObject(r)) continue // erreur déjà enregistrée ci-dessus

    const rId = r.id
    const poly = Array.isArray(r.polygon) ? r.polygon : []
    if (poly.length < 3 || !poly.every(isPoint)) errors.push(`pièce ${rId}: polygone ≥ 3 points`)
    if (!ROOM_TYPES.includes(r.type)) errors.push(`pièce ${rId}: type inconnu`)
  }

  for (const o of openings) {
    if (!isPlainObject(o)) continue // erreur déjà enregistrée ci-dessus

    const oId = o.id
    if (!OPENING_TYPES.includes(o.type)) errors.push(`ouverture ${oId}: type inconnu`)

    const w = byId[o.wall_id]
    if (!w) {
      errors.push(`ouverture ${oId}: mur introuvable`)
      continue
    }

    const off = 'offset_m' in o ? o.offset_m : 0
    const wd = 'width_m' in o ? o.width_m : 0
    const h = 'height_m' in o ? o.height_m : 0
    const sill = 'sill_m' in o ? o.sill_m : 0

    if (![off, wd, h, sill].every(isFiniteNumber)) {
      errors.push(`ouverture ${oId}: dimensions invalides`)
      continue
    }
    if (wd <= 0 || off < 0) {
      errors.push(`ouverture ${oId}: dimensions invalides`)
      continue
    }

    if (off + wd > wallLength(w) + 1e-6) errors.push(`ouverture ${oId}: dépasse le mur`)
    if (sill + h > wallHeightM + 1e-6) errors.push(`ouverture ${oId}: dépasse la hauteur du mur`)
  }

  return errors
}
