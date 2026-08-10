import { DIRHAM_SYMBOL } from '../../utils/currency'

/** Bloc copropriété : masqué pour un terrain ; checkbox + montant mensuel. */
export function CondoFeesField({ propertyType, isCondo, condoFees, onToggle, onAmount }) {
  if (propertyType === 'land') return null
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={!!isCondo} onChange={(e) => onToggle(e.target.checked)} />
        Bien en copropriété
      </label>
      {isCondo && (
        <div>
          <label className="block text-sm text-gray-700">Charges de copropriété ({DIRHAM_SYMBOL}/mois)</label>
          <input type="number" min="0" value={condoFees ?? ''} placeholder="800"
                 onChange={(e) => onAmount(e.target.value === '' ? null : Number(e.target.value))}
                 className="mt-1 w-full rounded-lg border px-3 py-2" />
        </div>
      )}
    </div>
  )
}
