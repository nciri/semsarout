import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useTranslation } from 'react-i18next'
import { FiLink, FiHome, FiCalendar, FiLock } from 'react-icons/fi'
import api from '../../../services/api'

// Regroupe les 3 pages StayManager (connexion / biens / réservations) en onglets.
// Les onglets Biens/Réservations restent grisés tant que le compte n'est pas connecté.
export default function StayManagerTabs() {
  const { t } = useTranslation(['dashboard'])
  const { data: status } = useQuery(
    'staymanager-status',
    async () => {
      const { data } = await api.get('/integrations/staymanager/status')
      return data
    },
    { retry: false, refetchOnWindowFocus: false }
  )
  const connected = status?.connected === true

  const baseTab = 'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors'
  const linkClass = ({ isActive }) =>
    `${baseTab} ${
      isActive
        ? 'border-primary-600 text-primary-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`

  const lockedTabs = [
    { to: 'biens', label: t('dashboard:stayManager.tabs.properties'), icon: FiHome },
    { to: 'reservations', label: t('dashboard:stayManager.tabs.reservations'), icon: FiCalendar }
  ]

  return (
    <div>
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            <NavLink to="." end className={linkClass}>
              <FiLink className="w-4 h-4" />
              {t('dashboard:stayManager.tabs.connection')}
            </NavLink>

            {lockedTabs.map(({ to, label, icon: Icon }) =>
              connected ? (
                <NavLink key={to} to={to} className={linkClass}>
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ) : (
                <span
                  key={to}
                  title={t('dashboard:stayManager.tabs.lockedHint')}
                  className={`${baseTab} border-transparent text-gray-300 cursor-not-allowed`}
                >
                  <FiLock className="w-4 h-4" />
                  {label}
                </span>
              )
            )}
          </nav>
        </div>
      </div>
      <Outlet />
    </div>
  )
}
