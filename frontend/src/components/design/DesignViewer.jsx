import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useFloorplanEditor from './useFloorplanEditor'
import FloorplanCanvas from './FloorplanCanvas'
import { ROOM_FILL } from './roomColors'
import LevelTabs from './LevelTabs'
import { publicBackgroundUrl } from '../../services/design3dPublic'
import { EMPTY_GEOMETRY, ROOM_TYPES, bbox, levelArea, normalizedToMeters } from '../../utils/floorplan'
import { useFormat } from '../../utils/format'

/**
 * Visionneuse PUBLIQUE, lecture seule, du plan d'un bien ou d'un lot.
 *
 * Réutilise le canevas de l'éditeur (`FloorplanCanvas readOnly`) et son état
 * (`useFloorplanEditor`) tels quels : un acheteur doit voir exactement le même
 * rendu qu'un agent, sans divergence de dessin ni seconde implémentation à
 * maintenir. Aucune mutation n'est possible : `readOnly` désactive tout outil
 * de dessin dans le canevas, et ce composant ne fournit ni bouton d'enregistrement
 * ni action réseau d'écriture.
 *
 * `project` doit venir de `GET /public/design3d/by-target` (ou `.../projects/{id}`) :
 * le service ne renvoie déjà que des projets publiés (`ready`) et filtre owner_id/
 * agency_id/tenant/revision_author_id — ce composant ne les réintroduit pas et ne
 * les affiche jamais.
 */

const PADDING_M = 1
const MIN_EXTENT_M = 3

function freeExtent(geometry) {
  const b = bbox(geometry)
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, MIN_EXTENT_M)
  return { extentM: span + PADDING_M * 2, pan: { x: b.minX - PADDING_M, y: b.minY - PADDING_M } }
}

export default function DesignViewer({ project, className = '' }) {
  const { t } = useTranslation(['dashboard'])
  const { fmtNumber } = useFormat()
  const { state, dispatch } = useFloorplanEditor()

  const levels = useMemo(
    () => [...(project?.levels || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [project],
  )
  const [levelId, setLevelId] = useState(null)

  useEffect(() => {
    if (!levels.length) return
    setLevelId((cur) => (cur && levels.some((l) => l.id === cur) ? cur : levels[0].id))
  }, [levels])

  const level = levels.find((l) => l.id === levelId) || null
  const geometry = level?.geometry || EMPTY_GEOMETRY

  // L'agent n'a explicitement autorisé le fond public que si le service l'a
  // renvoyé dans `background_image_key` (cf. DesignLevel.to_dict(public=True)) :
  // son absence — champ manquant ou vide — suffit à savoir qu'il ne faut rien montrer.
  const backgroundUrl = level?.background_image_key ? publicBackgroundUrl(level.id) : null
  const [bgAspect, setBgAspect] = useState(null)

  useEffect(() => {
    setBgAspect(null)
    if (!backgroundUrl) return undefined
    let alive = true
    const img = new Image()
    img.onload = () => {
      if (alive) setBgAspect(img.naturalWidth / img.naturalHeight || 1)
    }
    img.src = backgroundUrl
    return () => {
      alive = false
    }
  }, [backgroundUrl])

  const imageSize = useMemo(() => {
    if (!backgroundUrl || !bgAspect || !level?.calibration) return null
    const widthM = normalizedToMeters({ x: 1, y: 0 }, level.calibration, bgAspect).x
    return { widthM, heightM: widthM / bgAspect }
  }, [backgroundUrl, bgAspect, level])

  const view = imageSize
    ? { extentM: imageSize.widthM, pan: { x: 0, y: 0 } }
    : freeExtent(geometry)

  // Recharge la géométrie du niveau courant sans historique annulable (ce n'est
  // pas une édition), et recentre la vue — chaque niveau a sa propre emprise.
  useEffect(() => {
    if (!level) return
    dispatch({ type: 'LOAD_GEOMETRY', geometry, resetHistory: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne dépend que du niveau affiché, pas de `geometry` (nouvelle réf. à chaque rendu)
  }, [level?.id, dispatch])

  useEffect(() => {
    dispatch({ type: 'SET_VIEW', view: { zoom: 1, pan: view.pan } })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne recentre qu'au changement de niveau/fond, pas à chaque re-rendu de `view`
  }, [level?.id, imageSize, dispatch])

  const totalAreaM2 = useMemo(() => levels.reduce((sum, l) => sum + levelArea(l.geometry || EMPTY_GEOMETRY), 0), [levels])

  const roomTypesUsed = useMemo(() => {
    const present = new Set((geometry.rooms || []).map((r) => r.type))
    return ROOM_TYPES.filter((rt) => present.has(rt))
  }, [geometry])

  if (!project || !levels.length) return null

  return (
    <div className={className} data-testid="design-viewer">
      {levels.length > 1 && (
        <div className="mb-3">
          <LevelTabs levels={levels} currentId={levelId} onSelect={setLevelId} readOnly />
        </div>
      )}

      <div className="relative h-80 sm:h-96 rounded-lg overflow-hidden border border-gray-200 bg-white">
        <FloorplanCanvas
          state={state}
          dispatch={dispatch}
          background={imageSize ? backgroundUrl : null}
          imageSize={imageSize}
          extentM={view.extentM}
          readOnly
        />
      </div>

      {roomTypesUsed.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-sm text-gray-600" aria-label={t('dashboard:designEditor.viewer.legendLabel')}>
          {roomTypesUsed.map((rt) => (
            <span key={rt} className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: ROOM_FILL[rt] }} />
              {t(`dashboard:designEditor.roomTypes.${rt}`)}
            </span>
          ))}
        </div>
      )}

      <p className="mt-2 text-sm font-medium text-gray-700">
        {t('dashboard:designEditor.panel.totalArea', { area: fmtNumber(totalAreaM2, { maximumFractionDigits: 1 }) })}
      </p>
    </div>
  )
}
