import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiCheck, FiDelete } from 'react-icons/fi'

/**
 * Saisie d'une longueur sans clavier virtuel. Sur tablette, ouvrir le clavier
 * système pour taper « 3,45 » masque la moitié du plan : on fournit donc un pavé
 * de grandes touches (≥ 44 px) qui reste dans le panneau. L'`<input readOnly>`
 * garde la valeur lisible et sélectionnable ; `inputMode="decimal"` sert de repli
 * quand un vrai clavier est branché (le champ reste éditable au clavier physique
 * via les touches du pavé).
 */
export default function NumericPad({ label, value, unit = 'm', onCommit, onCancel, autoFocusValue = true }) {
  const { t } = useTranslation(['dashboard'])
  const [buffer, setBuffer] = useState(() => (value == null ? '' : String(value)))

  useEffect(() => {
    if (autoFocusValue) setBuffer(value == null ? '' : String(value))
  }, [value, autoFocusValue])

  const push = (ch) => setBuffer((b) => {
    if (ch === '.' && b.includes('.')) return b
    if (b.length >= 8) return b
    return b + ch
  })

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0']

  return (
    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="numeric-pad-value">
        {label}
      </label>
      <div className="flex items-center gap-2 mb-2">
        <input
          id="numeric-pad-value"
          className="input flex-1 text-lg font-mono"
          inputMode="decimal"
          value={buffer}
          onChange={(e) => setBuffer(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
        />
        <span className="text-gray-500 text-sm">{unit}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className="min-h-[44px] rounded-md bg-white border border-gray-300 text-lg font-medium active:bg-gray-100"
            onClick={() => push(k)}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          className="min-h-[44px] rounded-md bg-white border border-gray-300 flex items-center justify-center"
          aria-label={t('dashboard:designEditor.pad.backspace')}
          onClick={() => setBuffer((b) => b.slice(0, -1))}
        >
          <FiDelete className="w-5 h-5" />
        </button>
      </div>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          className="btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2"
          disabled={!(Number(buffer) > 0)}
          onClick={() => onCommit(Number(buffer))}
        >
          <FiCheck className="w-5 h-5" />
          {t('dashboard:designEditor.pad.validate')}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary min-h-[44px]" onClick={onCancel}>
            {t('dashboard:shared.actions.cancel')}
          </button>
        )}
      </div>
    </div>
  )
}
