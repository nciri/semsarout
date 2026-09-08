import { useTranslation } from 'react-i18next'
import {
  FiCheck, FiGrid, FiHash, FiLogIn, FiMaximize2, FiMinimize2, FiMinus, FiMousePointer,
  FiRotateCcw, FiRotateCw, FiSquare, FiSun, FiTrash2, FiX, FiZoomIn, FiZoomOut,
} from 'react-icons/fi'
import { TOOLS } from './useFloorplanEditor'

const ICONS = { select: FiMousePointer, wall: FiMinus, room: FiSquare, door: FiLogIn, window: FiSun }

/**
 * Barre d'outils tactile : chaque cible fait au moins 44 px, l'outil actif est
 * annoncé par `aria-pressed` (et pas seulement par la couleur). Annuler/refaire
 * sont TOUJOURS visibles — sur tablette il n'y a pas de Ctrl+Z.
 */
export default function Toolbar({
  tool, onTool, onUndo, onRedo, canUndo, canRedo, onZoom, onDelete, canDelete,
  draft, onFinishDraft, onCancelDraft, dimensions, grid, onToggle,
  fullscreen, onFullscreen, disabled = false, disabledReason = null, vertical = false,
}) {
  const { t } = useTranslation(['dashboard'])
  const base = 'min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md border transition-colors disabled:opacity-40'

  const toolBtn = (id) => {
    const Icon = ICONS[id]
    const active = tool === id
    return (
      <button
        key={id}
        type="button"
        aria-pressed={active}
        disabled={disabled}
        title={t(`dashboard:designEditor.tools.${id}`)}
        aria-label={t(`dashboard:designEditor.tools.${id}`)}
        onClick={() => onTool(id)}
        className={`${base} ${active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300'}`}
      >
        <Icon className="w-5 h-5" />
      </button>
    )
  }

  const plain = (key, Icon, onClick, extra = {}) => (
    <button
      type="button"
      onClick={onClick}
      title={t(`dashboard:designEditor.tools.${key}`)}
      aria-label={t(`dashboard:designEditor.tools.${key}`)}
      className={`${base} bg-white text-gray-600 border-gray-300`}
      {...extra}
    >
      <Icon className="w-5 h-5" />
    </button>
  )

  return (
    <div className={`flex ${vertical ? 'flex-col' : 'flex-row flex-wrap'} gap-2 items-center`}>
      <div className={`flex ${vertical ? 'flex-col' : 'flex-row'} gap-2`}>{TOOLS.map(toolBtn)}</div>

      {draft?.kind === 'room' && (
        <div className={`flex ${vertical ? 'flex-col' : 'flex-row'} gap-2`}>
          <button
            type="button"
            onClick={onFinishDraft}
            disabled={draft.points.length < 3}
            title={t('dashboard:designEditor.tools.finishRoom')}
            aria-label={t('dashboard:designEditor.tools.finishRoom')}
            className={`${base} bg-green-600 text-white border-green-600`}
          >
            <FiCheck className="w-5 h-5" />
          </button>
          {plain('cancelRoom', FiX, onCancelDraft)}
        </div>
      )}

      <div className={`flex ${vertical ? 'flex-col' : 'flex-row'} gap-2`}>
        <button
          type="button" onClick={onUndo} disabled={!canUndo}
          title={t('dashboard:designEditor.tools.undo')} aria-label={t('dashboard:designEditor.tools.undo')}
          className={`${base} bg-white text-gray-600 border-gray-300`}
        >
          <FiRotateCcw className="w-5 h-5" />
        </button>
        <button
          type="button" onClick={onRedo} disabled={!canRedo}
          title={t('dashboard:designEditor.tools.redo')} aria-label={t('dashboard:designEditor.tools.redo')}
          className={`${base} bg-white text-gray-600 border-gray-300`}
        >
          <FiRotateCw className="w-5 h-5" />
        </button>
        <button
          type="button" onClick={onDelete} disabled={!canDelete}
          title={t('dashboard:designEditor.tools.delete')} aria-label={t('dashboard:designEditor.tools.delete')}
          className={`${base} bg-white text-red-600 border-gray-300`}
        >
          <FiTrash2 className="w-5 h-5" />
        </button>
      </div>

      <div className={`flex ${vertical ? 'flex-col' : 'flex-row'} gap-2`}>
        {plain('zoomIn', FiZoomIn, () => onZoom(1.25))}
        {plain('zoomOut', FiZoomOut, () => onZoom(0.8))}
        <button
          type="button" onClick={() => onToggle('grid')} aria-pressed={grid}
          title={t('dashboard:designEditor.tools.grid')} aria-label={t('dashboard:designEditor.tools.grid')}
          className={`${base} ${grid ? 'bg-gray-200 text-gray-800' : 'bg-white text-gray-600'} border-gray-300`}
        >
          <FiGrid className="w-5 h-5" />
        </button>
        <button
          type="button" onClick={() => onToggle('dimensions')} aria-pressed={dimensions}
          title={t('dashboard:designEditor.tools.dimensions')} aria-label={t('dashboard:designEditor.tools.dimensions')}
          className={`${base} ${dimensions ? 'bg-gray-200 text-gray-800' : 'bg-white text-gray-600'} border-gray-300`}
        >
          <FiHash className="w-5 h-5" />
        </button>
        {plain('fullscreen', fullscreen ? FiMinimize2 : FiMaximize2, onFullscreen, { 'aria-pressed': fullscreen })}
      </div>

      {disabled && disabledReason && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 max-w-xs">{disabledReason}</p>
      )}
    </div>
  )
}
