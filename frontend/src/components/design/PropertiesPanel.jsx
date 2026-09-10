import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ROOM_TYPES, levelArea, polygonArea, wallLength } from '../../utils/floorplan'
import { isolateLtr } from '../../utils/format'
import { resizedWall, MIN_WALL_M } from './useFloorplanEditor'
import NumericPad from './NumericPad'
import GeometryProblems from './GeometryProblems'

// Champ numérique en cours de saisie → clé i18n de son libellé.
const PAD_LABELS = {
  length: 'length', thickness_m: 'thickness', width_m: 'openingWidth',
  height_m: 'openingHeight', sill_m: 'openingSill', offset_m: 'openingOffset', wallHeight: 'wallHeight',
}

/**
 * Panneau contextuel : ce qu'on peut régler dépend de la sélection. Les longueurs
 * passent par le pavé numérique (pas de clavier système sur tablette) ; les
 * champs à choix restreint restent des `<select>` natifs, qui ouvrent le sélecteur
 * du système — le plus fiable au doigt.
 */
export default function PropertiesPanel({
  state, dispatch, wallHeightM, onWallHeightChange, problems = [], onProblemSelect, onProblemRepair,
}) {
  const { t } = useTranslation(['dashboard'])
  const [padField, setPadField] = useState(null)
  const [lengthError, setLengthError] = useState(null)
  const { geometry, selection } = state
  const selected =
    selection?.kind === 'wall' ? geometry.walls.find((w) => w.id === selection.id)
      : selection?.kind === 'room' ? geometry.rooms.find((r) => r.id === selection.id)
        : selection?.kind === 'opening' ? geometry.openings.find((o) => o.id === selection.id)
          : null

  const patch = (p) => dispatch({ type: 'UPDATE_ELEMENT', kind: selection.kind, id: selection.id, patch: p })

  const numberRow = (labelKey, field, current, unit = 'm') => (
    <button
      type="button"
      className="w-full min-h-[44px] flex items-center justify-between px-3 rounded-md border border-gray-300 bg-white"
      onClick={() => setPadField(padField === field ? null : field)}
    >
      <span className="text-sm text-gray-600">{t(`dashboard:designEditor.panel.${labelKey}`)}</span>
      <span className="font-mono text-gray-900">{isolateLtr(`${Number(current).toFixed(2)} ${unit}`)}</span>
    </button>
  )

  const commitPad = (value) => {
    if (padField === 'length') {
      const resized = resizedWall(selected, value)
      if (resized === selected) {
        // resizedWall a refusé le changement
        setLengthError(t('dashboard:designEditor.panel.wallTooShort', { min: MIN_WALL_M.toFixed(2) }))
        setTimeout(() => setLengthError(null), 3000)
      } else {
        dispatch({ type: 'UPDATE_ELEMENT', kind: 'wall', id: selected.id, patch: resized })
        setLengthError(null)
      }
    } else if (padField === 'wallHeight') {
      onWallHeightChange(value)
      setLengthError(null)
    } else if (padField) {
      patch({ [padField]: value })
      setLengthError(null)
    }
    setPadField(null)
  }

  const padValue = padField === 'length' ? wallLength(selected)
    : padField === 'wallHeight' ? wallHeightM
      : padField ? selected?.[padField] : null

  return (
    <div className="space-y-3" data-testid="properties-panel">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-gray-900">{t('dashboard:designEditor.panel.title')}</h2>
        <span className="text-sm text-gray-600">
          {t('dashboard:designEditor.panel.totalArea', { area: levelArea(geometry).toFixed(1) })}
        </span>
      </div>

      <GeometryProblems problems={problems} onSelect={onProblemSelect} onRepair={onProblemRepair} />

      {lengthError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {lengthError}
        </p>
      )}

      {!selected && <p className="text-sm text-gray-500">{t('dashboard:designEditor.panel.noSelection')}</p>}

      {selection?.kind === 'wall' && selected && (
        <div className="space-y-2">
          {numberRow('length', 'length', wallLength(selected))}
          {numberRow('thickness', 'thickness_m', selected.thickness_m)}
        </div>
      )}

      {selection?.kind === 'room' && selected && (
        <div className="space-y-2">
          <label className="block text-sm text-gray-600" htmlFor="room-type">
            {t('dashboard:designEditor.panel.roomType')}
          </label>
          <select
            id="room-type"
            className="input min-h-[44px]"
            value={selected.type}
            onChange={(e) => dispatch({ type: 'SET_ROOM_TYPE', id: selected.id, roomType: e.target.value })}
          >
            {ROOM_TYPES.map((rt) => (
              <option key={rt} value={rt}>{t(`dashboard:designEditor.roomTypes.${rt}`)}</option>
            ))}
          </select>
          <label className="block text-sm text-gray-600" htmlFor="room-name">
            {t('dashboard:designEditor.panel.roomName')}
          </label>
          <input
            id="room-name"
            className="input min-h-[44px]"
            value={selected.name || ''}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <p className="text-sm text-gray-600">
            {t('dashboard:designEditor.panel.area', { area: polygonArea(selected.polygon).toFixed(1) })}
          </p>
        </div>
      )}

      {selection?.kind === 'opening' && selected && (
        <div className="space-y-2">
          <label className="block text-sm text-gray-600" htmlFor="opening-type">
            {t('dashboard:designEditor.panel.openingType')}
          </label>
          <select
            id="opening-type"
            className="input min-h-[44px]"
            value={selected.type}
            onChange={(e) => patch({ type: e.target.value })}
          >
            <option value="door">{t('dashboard:designEditor.openingTypes.door')}</option>
            <option value="window">{t('dashboard:designEditor.openingTypes.window')}</option>
          </select>
          {numberRow('openingWidth', 'width_m', selected.width_m)}
          {numberRow('openingHeight', 'height_m', selected.height_m)}
          {numberRow('openingSill', 'sill_m', selected.sill_m)}
          {numberRow('openingOffset', 'offset_m', selected.offset_m)}
        </div>
      )}

      <div className="pt-2 border-t border-gray-200">{numberRow('wallHeight', 'wallHeight', wallHeightM)}</div>

      {padField && (
        <NumericPad
          label={t(`dashboard:designEditor.panel.${PAD_LABELS[padField]}`)}
          value={padValue}
          onCommit={commitPad}
          onCancel={() => setPadField(null)}
        />
      )}
    </div>
  )
}
