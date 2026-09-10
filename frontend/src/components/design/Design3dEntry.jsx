import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiBox } from 'react-icons/fi'
import useAuthStore from '../../store/authStore'

/**
 * Entrée « Concevoir en 3D » depuis une annonce ou un lot. Sans le module, le
 * point d'entrée disparaît (variante `compact`, dans une ligne de tableau) ou
 * devient une invitation à l'activer (variante pleine).
 */
export default function Design3dEntry({ targetType, targetId, compact = false, disabled = false, className = '' }) {
  const { t } = useTranslation(['dashboard'])
  const hasFeature = useAuthStore((s) => s.hasFeature)
  const to = `/dashboard/conception?target_type=${targetType}&target_id=${targetId}`

  if (!hasFeature('design3d')) {
    if (compact) return null
    return (
      <Link
        to="/dashboard/compte/abonnement"
        className={`inline-flex items-center gap-2 min-h-[44px] px-3 rounded-md border border-dashed border-gray-300 text-gray-500 text-sm ${className}`}
      >
        <FiBox className="w-4 h-4" />
        {t('dashboard:designEditor.entitlement.upsell')}
      </Link>
    )
  }

  if (disabled) {
    return (
      <span
        className={`inline-flex items-center gap-2 min-h-[44px] px-3 text-gray-400 ${className}`}
        title={t('dashboard:designEditor.entitlement.needsSave')}
      >
        <FiBox className="w-4 h-4" />
        {t('dashboard:designEditor.entitlement.needsSave')}
      </span>
    )
  }

  if (compact) {
    return (
      <Link
        to={to}
        className={`p-2 text-gray-400 hover:text-primary-600 ${className}`}
        title={t('dashboard:designEditor.entry')}
        aria-label={t('dashboard:designEditor.entry')}
      >
        <FiBox className="w-4 h-4" />
      </Link>
    )
  }

  return (
    <Link to={to} className={`btn-secondary inline-flex items-center gap-2 min-h-[44px] ${className}`}>
      <FiBox className="w-4 h-4" />
      {t('dashboard:designEditor.entry')}
    </Link>
  )
}
