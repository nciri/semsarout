import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { bbox, levelArea } from '../../utils/floorplan'
import { initialState } from './useFloorplanEditor'
import FloorplanCanvas from './FloorplanCanvas'

const noop = () => {}

/**
 * Versions mises de côté par le serveur : quand un collègue enregistre par-dessus
 * une révision plus récente du propriétaire, sa géométrie n'est pas perdue, elle
 * est « étagée » (cf. services/design3d). Le propriétaire la prévisualise ici et
 * peut la récupérer — le chargement remplace la géométrie courante, reste
 * annulable, et s'enregistre ensuite comme n'importe quelle édition.
 */
function Preview({ geometry }) {
  const { state, extentM, pan } = useMemo(() => {
    const b = bbox(geometry)
    const w = Math.max(1, b.maxX - b.minX)
    const h = Math.max(1, b.maxY - b.minY)
    const margin = Math.max(w, h) * 0.1 + 0.5
    const p = { x: b.minX - margin, y: b.minY - margin }
    return { state: { ...initialState({ geometry }), pan: p }, extentM: Math.max(w, h) + margin * 2, pan: p }
  }, [geometry])

  return (
    <div className="h-48 border border-gray-200 rounded-md overflow-hidden bg-white">
      <FloorplanCanvas state={{ ...state, pan }} dispatch={noop} extentM={extentM} readOnly />
    </div>
  )
}

export default function ShelfDialog({ items, onRecover, onDismiss, onClose, busyId }) {
  const { t } = useTranslation(['dashboard'])
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-xl sm:rounded-xl p-4 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900">{t('dashboard:designEditor.shelf.title')}</h2>
        <p className="text-sm text-gray-600 mb-3">{t('dashboard:designEditor.shelf.intro')}</p>

        {items.length === 0 && <p className="text-sm text-gray-500">{t('dashboard:designEditor.shelf.empty')}</p>}

        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} className="border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-700 mb-2">
                {t('dashboard:designEditor.shelf.item', {
                  revision: item.base_revision,
                  area: levelArea(item.geometry || {}).toFixed(1),
                })}
              </p>
              <Preview geometry={item.geometry || {}} />
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  className="btn-primary flex-1 min-h-[44px]"
                  disabled={busyId === item.id}
                  onClick={() => onRecover(item)}
                >
                  {t('dashboard:designEditor.shelf.recover')}
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1 min-h-[44px]"
                  disabled={busyId === item.id}
                  onClick={() => onDismiss(item)}
                >
                  {t('dashboard:designEditor.shelf.dismiss')}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <button type="button" className="btn-secondary w-full min-h-[44px] mt-4" onClick={onClose}>
          {t('dashboard:designEditor.shelf.close')}
        </button>
      </div>
    </div>
  )
}
