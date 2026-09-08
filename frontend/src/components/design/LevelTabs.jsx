import { useTranslation } from 'react-i18next'
import { FiPlus } from 'react-icons/fi'

/**
 * Onglets de niveaux (RDC, R+1…). Cibles ≥ 44 px, défilement horizontal au doigt.
 * `readOnly` : consultation seule (visionneuse publique) — pas de bouton « ajouter ».
 */
export default function LevelTabs({ levels, currentId, onSelect, onCreate, readOnly = false }) {
  const { t } = useTranslation(['dashboard'])
  return (
    <div className="flex items-center gap-2 overflow-x-auto" role="tablist" aria-label={t('dashboard:designEditor.levels.label')}>
      {levels.map((lv) => (
        <button
          key={lv.id}
          type="button"
          role="tab"
          aria-selected={lv.id === currentId}
          onClick={() => onSelect(lv.id)}
          className={`min-h-[44px] px-4 rounded-md border whitespace-nowrap ${
            lv.id === currentId ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'
          }`}
        >
          {lv.name}
        </button>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={onCreate}
          aria-label={t('dashboard:designEditor.levels.add')}
          title={t('dashboard:designEditor.levels.add')}
          className="min-w-[44px] min-h-[44px] rounded-md border border-dashed border-gray-400 text-gray-600 flex items-center justify-center"
        >
          <FiPlus className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
