import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  newId, polygonArea, projectPointOnWall, snapAngle, snapToGrid, snapToPoints, wallLength,
} from '../../utils/floorplan'
import {
  DEFAULT_WALL_THICKNESS_M, MIN_WALL_M, OPENING_DEFAULTS, hitTest, hitVertex, openingSpan, selectionItems,
} from './useFloorplanEditor'
import { ROOM_FILL } from './roomColors'
import { isolateLtr } from '../../utils/format'

/**
 * Canevas SVG de l'éditeur de plan. Tout est dessiné EN MÈTRES : le viewBox porte
 * le zoom et le déplacement, si bien qu'aucune conversion n'est nécessaire pour
 * la géométrie elle-même. Seules les épaisseurs de trait « d'interface »
 * (hairlines, textes, poignées) sont converties depuis les pixels via
 * `pxPerMeter`, pour rester lisibles et touchables à n'importe quel zoom.
 *
 * Tactile d'abord : `touch-action: none` (le navigateur ne vole ni le scroll ni
 * le pinch), un doigt = l'outil courant, deux doigts = déplacement + zoom,
 * appui long = menu contextuel. Aucun comportement ne dépend du survol.
 */

const MIN_ZOOM = 0.2
const MAX_ZOOM = 40
const TAP_SLOP_PX = 8
const LONG_PRESS_MS = 500
// Rayon de la zone tactile : 22 px de rayon = 44 px de cible, le minimum retenu
// pour le tactile (cf. cahier des charges).
const TOUCH_RADIUS_PX = 22

const midpoint = (pts) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
})

const fmt = (v, digits = 2) => Number(v).toFixed(digits)

export default function FloorplanCanvas({
  state,
  dispatch,
  background = null,
  imageSize = null,
  extentM = 20,
  readOnly = false,
  locked = false,
  calibration = null,
  onLongPress,
  className = '',
}) {
  const { t } = useTranslation(['dashboard'])
  const svgRef = useRef(null)
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const drag = useRef(null)
  // Origine (en mètres) d'un glissé de bloc : dernier point pointeur connu, pour
  // dispatcher MOVE_SELECTION avec un delta relatif à chaque mouvement — même
  // patron que `drag` (déplacement de sommet), mais sur toute la sélection.
  const moveSel = useRef(null)
  const longPress = useRef(null)
  const moved = useRef(false)
  // Origine (en mètres) d'un glissé de sélection au rectangle avec l'outil
  // « Sélectionner » sur une zone vide. `areaRect` ne sert qu'au rendu du
  // rectangle en cours ; l'action SELECT_AREA n'est dispatchée qu'au relâché.
  const area = useRef(null)
  const [areaRect, setAreaRect] = useState(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { geometry, zoom, pan, grid, snap, dimensions, selection, draft, tool } = state
  const viewW = extentM / zoom
  const viewH = viewW * (size.h / size.w || 0.75)
  const pxPerMeter = size.w / viewW
  const px = useCallback((n) => n / pxPerMeter, [pxPerMeter])
  const touchM = px(TOUCH_RADIUS_PX)

  const toMeters = useCallback(
    (e) => {
      const rect = svgRef.current?.getBoundingClientRect()
      const w = rect?.width || size.w
      const h = rect?.height || size.h
      return {
        x: pan.x + ((e.clientX - (rect?.left || 0)) / w) * viewW,
        y: pan.y + ((e.clientY - (rect?.top || 0)) / h) * viewH,
      }
    },
    [pan.x, pan.y, viewW, viewH, size.w, size.h],
  )

  const endpoints = []
  for (const w of geometry.walls) endpoints.push(w.a, w.b)
  for (const r of geometry.rooms) for (const p of r.polygon || []) endpoints.push(p)

  const snapped = useCallback(
    (p, origin) => {
      let q = p
      if (origin && snap.angle) q = snapAngle(origin, q, true)
      if (snap.grid) q = snapToGrid(q, grid.step)
      if (snap.points) q = snapToPoints(q, endpoints, touchM)
      return q
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `endpoints` est recalculé à chaque rendu depuis `geometry`
    [snap.angle, snap.grid, snap.points, grid.step, touchM, geometry],
  )

  const interactive = !readOnly && !locked
  const calibrating = !!calibration?.active

  const clearLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
  }

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = false

    if (pointers.current.size === 2) {
      // Deux doigts : on abandonne tout tracé en cours — le geste est une
      // navigation, pas un dessin. Un glissé (sommet ou sélection en bloc) en
      // cours doit fermer son entrée d'historique exactement comme au relâché
      // normal : sans ce END_DRAG, `state.dragging` restait vrai indéfiniment
      // et tout l'historique d'annulation de la suite de la session se
      // repliait en une seule étape.
      clearLongPress()
      if (drag.current || moveSel.current) dispatch({ type: 'END_DRAG' })
      drag.current = null
      moveSel.current = null
      area.current = null
      setAreaRect(null)
      if (draft?.kind === 'wall') dispatch({ type: 'SET_DRAFT', draft: null })
      const pts = [...pointers.current.values()]
      gesture.current = {
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        startMid: midpoint(pts),
        zoom0: zoom,
        pan0: { ...pan },
      }
      return
    }
    if (pointers.current.size > 2) return

    const p = toMeters(e)
    if (onLongPress && !readOnly) {
      const client = { x: e.clientX, y: e.clientY }
      longPress.current = setTimeout(() => {
        longPress.current = null
        onLongPress({ point: p, client, hit: hitTest(geometry, p, touchM) })
      }, LONG_PRESS_MS)
    }
    if (calibrating || !interactive) return

    if (tool === 'select') {
      const v = hitVertex(geometry, p, touchM)
      if (v) {
        drag.current = v
        return
      }
      const hit = hitTest(geometry, p, touchM)
      // Toucher un objet déjà sélectionné démarre un glissé de bloc plutôt qu'une
      // re-sélection : `selectionItems` couvre indifféremment le cas à un ou
      // plusieurs objets. Restreint à mur/pièce : une ouverture n'a rien à
      // translater (elle suit son mur via son offset), la glisser ne doit donc
      // pas déclencher MOVE_SELECTION.
      if (
        hit && (hit.kind === 'wall' || hit.kind === 'room') &&
        selectionItems(selection).some((i) => i.kind === hit.kind && i.id === hit.id)
      ) {
        moveSel.current = p
        return
      }
      if (hit) {
        dispatch({ type: 'SELECT', selection: hit })
        return
      }
      // Zone vide : geste encore ambigu entre appui simple (déselection) et
      // glissé (rectangle) — la décision se prend au relâché, sur `moved.current`.
      area.current = p
      return
    }
    if (tool === 'wall') {
      const a = snapped(p)
      dispatch({ type: 'SET_DRAFT', draft: { kind: 'wall', a, b: a } })
    }
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return
    const start = pointers.current.get(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) {
      moved.current = true
      clearLongPress()
    }

    if (pointers.current.size >= 2 && gesture.current) {
      const pts = [...pointers.current.values()].slice(0, 2)
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      const g = gesture.current
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.zoom0 * (d / g.startDist)))
      const rect = svgRef.current?.getBoundingClientRect()
      const w = rect?.width || size.w
      const h = rect?.height || size.h
      const v0 = extentM / g.zoom0
      // Point du plan qui était sous le centre des deux doigts au début du geste :
      // il doit y rester, sinon le zoom « fuit » sous les doigts.
      const world = {
        x: g.pan0.x + ((g.startMid.x - (rect?.left || 0)) / w) * v0,
        y: g.pan0.y + ((g.startMid.y - (rect?.top || 0)) / h) * v0 * (h / w),
      }
      const mid = midpoint(pts)
      const v1 = extentM / nextZoom
      dispatch({
        type: 'SET_VIEW',
        view: {
          zoom: nextZoom,
          pan: {
            x: world.x - ((mid.x - (rect?.left || 0)) / w) * v1,
            y: world.y - ((mid.y - (rect?.top || 0)) / h) * v1 * (h / w),
          },
        },
      })
      return
    }

    if (!interactive || calibrating) return
    const p = toMeters(e)
    if (area.current) {
      setAreaRect({ x1: area.current.x, y1: area.current.y, x2: p.x, y2: p.y })
      return
    }
    if (drag.current) {
      const ref = drag.current
      const origin = ref.kind === 'wall' ? geometry.walls.find((w) => w.id === ref.id)?.[ref.end === 'a' ? 'b' : 'a'] : null
      dispatch({ type: 'MOVE_VERTEX', ref, point: snapped(p, origin), dragging: true })
      return
    }
    if (moveSel.current) {
      const origin = moveSel.current
      moveSel.current = p
      dispatch({ type: 'MOVE_SELECTION', delta: { x: p.x - origin.x, y: p.y - origin.y }, dragging: true })
      return
    }
    if (tool === 'wall' && draft?.kind === 'wall') {
      dispatch({ type: 'SET_DRAFT', draft: { ...draft, b: snapped(p, draft.a) } })
    }
  }

  function addOpening(p, type) {
    let best = null
    let bestD = touchM
    for (const w of geometry.walls) {
      const pr = projectPointOnWall(p, w)
      if (pr.distance <= bestD) {
        best = { wall: w, pr }
        bestD = pr.distance
      }
    }
    if (!best) return
    const def = OPENING_DEFAULTS[type]
    const len = wallLength(best.wall)
    const width = Math.min(def.width_m, len)
    const offset = Math.max(0, Math.min(len - width, best.pr.offset_m - width / 2))
    dispatch({
      type: 'ADD_OPENING',
      opening: { id: newId(), wall_id: best.wall.id, type, offset_m: offset, width_m: width, height_m: def.height_m, sill_m: def.sill_m },
    })
  }

  function onPointerUp(e) {
    clearLongPress()
    const wasGesture = !!gesture.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) gesture.current = null
    if (wasGesture) return

    if (drag.current) {
      drag.current = null
      dispatch({ type: 'END_DRAG' })
      return
    }
    if (moveSel.current) {
      moveSel.current = null
      dispatch({ type: 'END_DRAG' })
      return
    }
    const p = toMeters(e)
    if (area.current) {
      const origin = area.current
      area.current = null
      setAreaRect(null)
      if (moved.current) {
        dispatch({ type: 'SELECT_AREA', rect: { x1: origin.x, y1: origin.y, x2: p.x, y2: p.y } })
      } else {
        dispatch({ type: 'SELECT', selection: hitTest(geometry, p, touchM) })
      }
      return
    }
    if (calibrating) {
      if (!moved.current && imageSize) {
        calibration.onPoint({ x: p.x / imageSize.widthM, y: p.y / imageSize.heightM })
      }
      return
    }
    if (!interactive) return

    if (tool === 'wall' && draft?.kind === 'wall') {
      const b = snapped(p, draft.a)
      if (wallLength({ a: draft.a, b }) >= MIN_WALL_M) {
        dispatch({ type: 'ADD_WALL', wall: { id: newId(), a: draft.a, b, thickness_m: DEFAULT_WALL_THICKNESS_M } })
      } else {
        dispatch({ type: 'SET_DRAFT', draft: null })
      }
      return
    }
    if (moved.current) return
    if (tool === 'room') {
      const q = snapped(p)
      dispatch({ type: 'SET_DRAFT', draft: { kind: 'room', points: [...(draft?.kind === 'room' ? draft.points : []), q] } })
      return
    }
    if (tool === 'door' || tool === 'window') addOpening(p, tool)
  }

  const gridId = useRef(`fp-grid-${Math.random().toString(36).slice(2)}`).current
  const hair = px(1)
  const label = px(13)
  const handleR = Math.max(0.06, px(11))
  const selectedId = selection?.id
  // Étend la mise en évidence à la sélection multiple sans changer le cas à un
  // élément : `selectedId` (utilisé partout ailleurs) reste la voie normale, ces
  // ensembles ne servent qu'à repérer les objets d'une sélection `multi`.
  const selItems = selectionItems(selection)
  const multiWallIds = selection?.kind === 'multi' ? new Set(selItems.filter((i) => i.kind === 'wall').map((i) => i.id)) : null
  const multiRoomIds = selection?.kind === 'multi' ? new Set(selItems.filter((i) => i.kind === 'room').map((i) => i.id)) : null

  const roomLabel = (r) => {
    const area = polygonArea(r.polygon)
    return `${r.name || t(`dashboard:designEditor.roomTypes.${r.type}`)} · ${isolateLtr(`${fmt(area, 1)} m²`)}`
  }

  return (
    <svg
      ref={svgRef}
      dir="ltr"
      data-testid="floorplan-canvas"
      role="application"
      aria-label={t('dashboard:designEditor.canvasLabel')}
      className={`w-full h-full bg-white select-none ${className}`}
      style={{ touchAction: 'none' }}
      viewBox={`${pan.x} ${pan.y} ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid slice"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <pattern id={gridId} width={grid.step} height={grid.step} patternUnits="userSpaceOnUse">
          <path d={`M ${grid.step} 0 L 0 0 0 ${grid.step}`} fill="none" stroke="#e5e7eb" strokeWidth={hair} />
        </pattern>
      </defs>

      {grid.visible && <rect x={pan.x} y={pan.y} width={viewW} height={viewH} fill={`url(#${gridId})`} />}

      {background && imageSize && (
        <image href={background} x={0} y={0} width={imageSize.widthM} height={imageSize.heightM} opacity={0.6} preserveAspectRatio="none" />
      )}

      {geometry.rooms.map((r) => (
        <g key={r.id}>
          <polygon
            points={(r.polygon || []).map((p) => `${p.x},${p.y}`).join(' ')}
            fill={ROOM_FILL[r.type] || ROOM_FILL.other}
            fillOpacity={0.75}
            stroke={selectedId === r.id || multiRoomIds?.has(r.id) ? '#2563eb' : '#9ca3af'}
            strokeWidth={selectedId === r.id || multiRoomIds?.has(r.id) ? px(2) : hair}
          />
          {(r.polygon || []).length >= 3 && (
            <text
              x={midpoint(r.polygon).x}
              y={midpoint(r.polygon).y}
              fontSize={label}
              textAnchor="middle"
              fill="#374151"
              style={{ pointerEvents: 'none' }}
            >
              {roomLabel(r)}
            </text>
          )}
        </g>
      ))}

      {geometry.walls.map((w) => (
        <g key={w.id}>
          <line
            x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
            stroke={selectedId === w.id || multiWallIds?.has(w.id) ? '#2563eb' : '#374151'}
            strokeWidth={w.thickness_m}
            strokeLinecap="square"
          />
          {dimensions && (() => {
            // Décalage perpendiculaire au mur, selon sa normale (déterminée par l'ordre a→b).
            // Garantit que la cote ne retombe jamais sur le trait.
            // Limitation connue : deux cotes de murs parallèles proches peuvent se chevaucher.
            const dx = w.b.x - w.a.x
            const dy = w.b.y - w.a.y
            const len = Math.hypot(dx, dy) || 1
            const off = px(10) + (w.thickness_m || DEFAULT_WALL_THICKNESS_M) / 2
            return (
              <text
                x={(w.a.x + w.b.x) / 2 + (-dy / len) * off}
                y={(w.a.y + w.b.y) / 2 + (dx / len) * off}
                fontSize={label}
                textAnchor="middle"
                fill="#1f2937"
                style={{ pointerEvents: 'none' }}
              >
                {isolateLtr(`${fmt(wallLength(w))} m`)}
              </text>
            )
          })()}
        </g>
      ))}

      {geometry.openings.map((o) => {
        const span = openingSpan(o, geometry.walls.find((w) => w.id === o.wall_id))
        if (!span) return null
        const w = geometry.walls.find((x) => x.id === o.wall_id)
        return (
          <line
            key={o.id}
            x1={span.a.x} y1={span.a.y} x2={span.b.x} y2={span.b.y}
            stroke={selectedId === o.id ? '#2563eb' : o.type === 'window' ? '#38bdf8' : '#ffffff'}
            strokeWidth={(w?.thickness_m || DEFAULT_WALL_THICKNESS_M) * 1.05}
            strokeLinecap="butt"
          />
        )
      })}

      {draft?.kind === 'wall' && (
        <line
          x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y}
          stroke="#2563eb" strokeWidth={px(3)} strokeDasharray={`${px(8)} ${px(6)}`}
        />
      )}
      {draft?.kind === 'room' && draft.points.length > 0 && (
        <g>
          <polyline
            points={draft.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke="#2563eb" strokeWidth={px(3)} strokeDasharray={`${px(8)} ${px(6)}`}
          />
          {draft.points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={handleR} fill="#2563eb" />
          ))}
        </g>
      )}

      {areaRect && (
        <rect
          x={Math.min(areaRect.x1, areaRect.x2)}
          y={Math.min(areaRect.y1, areaRect.y2)}
          width={Math.abs(areaRect.x2 - areaRect.x1)}
          height={Math.abs(areaRect.y2 - areaRect.y1)}
          fill="rgba(37,99,235,0.08)"
          stroke="#2563eb"
          strokeWidth={px(1.5)}
          strokeDasharray={`${px(6)} ${px(4)}`}
        />
      )}

      {calibration?.points?.map((p, i) =>
        imageSize ? (
          <circle key={i} cx={p.x * imageSize.widthM} cy={p.y * imageSize.heightM} r={handleR} fill="#f97316" stroke="#fff" strokeWidth={hair} />
        ) : null,
      )}
      {calibration?.points?.length === 2 && imageSize && (
        <line
          x1={calibration.points[0].x * imageSize.widthM} y1={calibration.points[0].y * imageSize.heightM}
          x2={calibration.points[1].x * imageSize.widthM} y2={calibration.points[1].y * imageSize.heightM}
          stroke="#f97316" strokeWidth={px(3)}
        />
      )}

      {!readOnly && selection?.kind === 'wall' &&
        geometry.walls.filter((w) => w.id === selection.id).flatMap((w) => [
          <circle key={`${w.id}-a`} cx={w.a.x} cy={w.a.y} r={handleR} fill="#fff" stroke="#2563eb" strokeWidth={px(2)} />,
          <circle key={`${w.id}-b`} cx={w.b.x} cy={w.b.y} r={handleR} fill="#fff" stroke="#2563eb" strokeWidth={px(2)} />,
        ])}
      {!readOnly && selection?.kind === 'room' &&
        (geometry.rooms.find((r) => r.id === selection.id)?.polygon || []).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={handleR} fill="#fff" stroke="#2563eb" strokeWidth={px(2)} />
        ))}
    </svg>
  )
}
