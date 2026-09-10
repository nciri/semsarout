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

// Copie ponctuelle et indépendante : aucun lien n'est gardé avec la source, qui n'est
// jamais modifiée. Les identifiants sont régénérés pour éviter toute collision, et la
// correspondance ouverture → mur est réécrite en conséquence.
export function copyGeometry(geometry) {
  const wallIds = new Map((geometry.walls || []).map((w) => [w.id, newId()]))
  return {
    walls: (geometry.walls || []).map((w) => ({ ...w, id: wallIds.get(w.id) })),
    rooms: (geometry.rooms || []).map((r) => ({ ...r, id: newId() })),
    openings: (geometry.openings || [])
      .filter((o) => wallIds.has(o.wall_id))
      .map((o) => ({ ...o, id: newId(), wall_id: wallIds.get(o.wall_id) })),
  }
}

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

// --- geometryProblems / validateGeometry : miroir exact de app/schemas.py::validate_geometry ---
// Aucune entrée (même absurde) ne doit lever d'exception : uniquement des gardes numériques,
// jamais de try/catch défensif — le comportement observable doit être identique au serveur,
// pas sa forme interne.

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

const isPoint = (p) => isPlainObject(p) && isFiniteNumber(p.x) && isFiniteNumber(p.y)

// Problèmes structurés : même parcours que le miroir serveur, mais chaque entrée porte
// son code, l'élément concerné, et si elle n'est qu'une CONSÉQUENCE d'un autre problème
// (`derived`). L'interface n'affiche que les causes ; le miroir chaînes, lui, doit rester
// identique au serveur, conséquences comprises, sous peine de fausser la parité.
//
// `geometry_object`, `list_expected`, `entry_object` et `ids_duplicate` couvrent des entrées
// d'entrée malformées (pas des éléments métier) : elles ne portent pas de `kind`/`id`
// exploitable et ne sont pas exposées dans la liste de codes de l'interface, réservée aux
// problèmes qu'un agent peut voir et corriger sur le plan.
export function geometryProblems(geometry, wallHeightM) {
  const problems = []

  if (!isPlainObject(geometry)) return [{ code: 'geometry_object', kind: null, id: null, derived: false }]

  if (JSON.stringify(geometry).length > MAX_GEOMETRY_BYTES) {
    problems.push({ code: 'geometry_too_large', kind: null, id: null, derived: false })
  }

  if (!isFiniteNumber(wallHeightM)) {
    problems.push({ code: 'wall_height', kind: null, id: null, derived: false })
    return problems
  }

  const collect = (raw, name) => {
    if (raw != null && !Array.isArray(raw)) {
      problems.push({ code: 'list_expected', kind: null, id: null, derived: false, name })
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
        problems.push({ code: 'entry_object', kind: null, id: null, derived: false, name, idx })
        continue
      }
      const eId = e.id
      if (!eId) {
        problems.push({ code: 'ids_duplicate', kind: null, id: null, derived: false, name })
        break
      }
      ids.push(eId)
    }
    if (ids.length && ids.length !== new Set(ids).size) {
      problems.push({ code: 'ids_duplicate', kind: null, id: null, derived: false, name })
    }
  }

  const byId = {}
  for (const w of walls) {
    if (!isPlainObject(w)) continue // erreur déjà enregistrée ci-dessus

    const wId = w.id
    if (!isPoint(w.a) || !isPoint(w.b)) {
      problems.push({ code: 'wall_too_short', kind: 'wall', id: wId, derived: false })
      continue
    }
    if (!(wallLength(w) > 0)) {
      problems.push({ code: 'wall_too_short', kind: 'wall', id: wId, derived: false })
      continue
    }
    const t = w.thickness_m
    if (!isFiniteNumber(t) || !(t > 0 && t <= 1)) {
      problems.push({ code: 'wall_thickness', kind: 'wall', id: wId, derived: false })
    }
    byId[wId] = w
  }

  for (const r of rooms) {
    if (!isPlainObject(r)) continue // erreur déjà enregistrée ci-dessus

    const rId = r.id
    const poly = Array.isArray(r.polygon) ? r.polygon : []
    if (poly.length < 3 || !poly.every(isPoint)) {
      problems.push({ code: 'room_polygon', kind: 'room', id: rId, derived: false })
    }
    if (!ROOM_TYPES.includes(r.type)) problems.push({ code: 'room_type', kind: 'room', id: rId, derived: false })
  }

  for (const o of openings) {
    if (!isPlainObject(o)) continue // erreur déjà enregistrée ci-dessus

    const oId = o.id
    if (!OPENING_TYPES.includes(o.type)) {
      problems.push({ code: 'opening_type', kind: 'opening', id: oId, derived: false })
    }

    const w = byId[o.wall_id]
    if (!w) {
      // Conséquence d'un mur invalide (absent de byId) : ne pas la traiter comme la
      // cause du problème, sous peine de masquer le vrai coupable à l'agent.
      problems.push({ code: 'opening_orphan', kind: 'opening', id: oId, derived: true })
      continue
    }

    const off = 'offset_m' in o ? o.offset_m : 0
    const wd = 'width_m' in o ? o.width_m : 0
    const h = 'height_m' in o ? o.height_m : 0
    const sill = 'sill_m' in o ? o.sill_m : 0

    if (![off, wd, h, sill].every(isFiniteNumber)) {
      problems.push({ code: 'opening_dimensions', kind: 'opening', id: oId, derived: false })
      continue
    }
    if (wd <= 0 || off < 0) {
      problems.push({ code: 'opening_dimensions', kind: 'opening', id: oId, derived: false })
      continue
    }

    if (off + wd > wallLength(w) + 1e-6) {
      problems.push({ code: 'opening_overflows', kind: 'opening', id: oId, derived: false })
    }
    if (sill + h > wallHeightM + 1e-6) {
      problems.push({ code: 'opening_wall_height', kind: 'opening', id: oId, derived: false })
    }
  }

  return problems
}

const MESSAGES = {
  geometry_object: () => 'geometry doit être un objet',
  geometry_too_large: () => 'geometry dépasse 512 Ko',
  wall_height: () => 'wall_height_m invalide',
  list_expected: (p) => `${p.name}: liste attendue`,
  entry_object: (p) => `${p.name}[${p.idx}]: objet attendu`,
  ids_duplicate: (p) => `${p.name}: identifiants manquants ou en double`,
  wall_too_short: (p) => `mur ${p.id}: deux points distincts requis`,
  wall_thickness: (p) => `mur ${p.id}: thickness_m dans ]0, 1]`,
  room_polygon: (p) => `pièce ${p.id}: polygone ≥ 3 points`,
  room_type: (p) => `pièce ${p.id}: type inconnu`,
  opening_orphan: (p) => `ouverture ${p.id}: mur introuvable`,
  opening_type: (p) => `ouverture ${p.id}: type inconnu`,
  opening_dimensions: (p) => `ouverture ${p.id}: dimensions invalides`,
  opening_overflows: (p) => `ouverture ${p.id}: dépasse le mur`,
  opening_wall_height: (p) => `ouverture ${p.id}: dépasse la hauteur du mur`,
}

export function validateGeometry(geometry, wallHeightM) {
  return geometryProblems(geometry, wallHeightM).map((p) => MESSAGES[p.code](p))
}
