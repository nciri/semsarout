import { useTranslation } from 'react-i18next'
import { FiGlobe } from 'react-icons/fi'

// Bascule fr ⇄ ar. Affiche le libellé de la langue CIBLE.
export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation('common')
  const target = i18n.language === 'ar' ? 'fr' : 'ar'
  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(target)}
      className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
      title={t(`language.${target}`)}
    >
      <FiGlobe className="w-4 h-4" />
      <span>{t(`language.${target}`)}</span>
    </button>
  )
}
