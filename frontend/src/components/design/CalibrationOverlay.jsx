import { useTranslation } from 'react-i18next'
import { FiRotateCcw, FiX } from 'react-icons/fi'
import NumericPad from './NumericPad'

/**
 * Calibration d'un plan importé : l'agent pointe deux extrémités d'une cote
 * connue puis saisit sa longueur réelle. Tant que ce n'est pas fait, les outils
 * de dessin restent désactivés — tracer sans échelle produirait des mètres faux,
 * impossibles à rattraper autrement qu'en recommençant.
 */
export default function CalibrationOverlay({ points, meters, onReset, onCommit, onCancel, required }) {
  const { t } = useTranslation(['dashboard'])
  const step = points.length < 2 ? 'points' : 'length'

  return (
    <div className="absolute inset-x-0 bottom-0 p-3 bg-white/95 border-t border-gray-200 shadow-lg max-h-[70%] overflow-y-auto">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="font-semibold text-gray-900">{t('dashboard:designEditor.calibration.title')}</h3>
          <p className="text-sm text-gray-600">
            {step === 'points'
              ? t('dashboard:designEditor.calibration.pickPoints', { n: points.length })
              : t('dashboard:designEditor.calibration.enterLength')}
          </p>
          {required && <p className="text-sm text-amber-700 mt-1">{t('dashboard:designEditor.calibration.required')}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button" onClick={onReset}
            className="min-w-[44px] min-h-[44px] rounded-md border border-gray-300 flex items-center justify-center"
            aria-label={t('dashboard:designEditor.calibration.reset')}
            title={t('dashboard:designEditor.calibration.reset')}
          >
            <FiRotateCcw className="w-5 h-5" />
          </button>
          {!required && (
            <button
              type="button" onClick={onCancel}
              className="min-w-[44px] min-h-[44px] rounded-md border border-gray-300 flex items-center justify-center"
              aria-label={t('dashboard:shared.actions.cancel')}
              title={t('dashboard:shared.actions.cancel')}
            >
              <FiX className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {step === 'length' && (
        <NumericPad label={t('dashboard:designEditor.calibration.lengthLabel')} value={meters} onCommit={onCommit} />
      )}
    </div>
  )
}
