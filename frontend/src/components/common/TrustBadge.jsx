import { useTranslation } from 'react-i18next'
import { FiShield } from 'react-icons/fi'

/**
 * Badge du score de confiance réel (KYC + transactions conclues), remplace
 * l'ancien booléen `agency.is_verified` jamais vérifié. Rend `null` quand
 * `level` vaut `"none"` (pas de badge plutôt qu'un badge "non vérifié").
 */
export default function TrustBadge({ level, dealCount = 0, size = 'md' }) {
  const { t } = useTranslation(['public'])
  if (!level || level === 'none') return null

  const label = level === 'verified_experience'
    ? t('public:agencyDetail.trustExperience', { count: dealCount })
    : t('public:agencyDetail.trustVerified')
  const textCls = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <span className={`inline-flex items-center gap-1 badge-success ${textCls}`}>
      <FiShield className="w-3.5 h-3.5" />
      {label}
    </span>
  )
}
