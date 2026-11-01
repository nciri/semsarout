import { useTranslation } from 'react-i18next'

/**
 * Bascule français / arabe des modèles de contrats.
 *
 * Les cinq actes intégrés existent dans les deux langues. Les lister côte à côte donnait dix
 * entrées, dont cinq illisibles pour un utilisateur francophone : ce sont deux versions d'un
 * même acte, pas deux modèles. Le français est montré par défaut, l'arabe sur demande.
 */
function LanguageToggle({ value, onChange, className = '' }) {
  const { t } = useTranslation('backoffice')
  return (
    <div className={`inline-flex rounded-lg border border-gray-200 p-0.5 ${className}`} role="group" aria-label={t('contracts.templates.language.label')}>
      {['fr', 'ar'].map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          aria-pressed={value === code}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === code ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {t(`contracts.templates.language.${code}`)}
        </button>
      ))}
    </div>
  )
}

export default LanguageToggle
