import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiCheckCircle, FiCloudOff, FiLock, FiRefreshCw } from 'react-icons/fi'

/**
 * Miroir visible de l'état du moteur de synchronisation (design3dSync). Le badge
 * ne déclenche rien de bloquant : l'édition est locale d'abord, il ne fait
 * qu'informer — combien d'opérations attendent, si le serveur a mis une version
 * de côté, si la session a expiré.
 */
const STYLES = {
  synced: { icon: FiCheckCircle, cls: 'bg-green-50 text-green-700 border-green-200' },
  syncing: { icon: FiRefreshCw, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  offline: { icon: FiCloudOff, cls: 'bg-gray-100 text-gray-700 border-gray-300' },
  conflict: { icon: FiAlertTriangle, cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  auth_expired: { icon: FiLock, cls: 'bg-red-50 text-red-700 border-red-200' },
  error: { icon: FiAlertTriangle, cls: 'bg-red-50 text-red-700 border-red-200' },
}

export default function SyncBadge({ sync }) {
  const { t } = useTranslation(['dashboard'])
  const state = STYLES[sync?.state] ? sync.state : 'synced'
  const { icon: Icon, cls } = STYLES[state]
  const pending = sync?.pending || 0
  const text =
    state === 'offline' && pending > 0
      ? t('dashboard:designEditor.sync.offlinePending', { n: pending })
      : t(`dashboard:designEditor.sync.${state}`)

  return (
    <span
      role="status"
      data-testid="sync-badge"
      data-pending={pending}
      className={`inline-flex items-center gap-2 px-3 min-h-[36px] rounded-full border text-sm ${cls}`}
    >
      <Icon className="w-4 h-4" />
      {text}
    </span>
  )
}
