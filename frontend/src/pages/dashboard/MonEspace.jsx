import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiSearch, FiClipboard, FiFileText, FiInbox, FiUser, FiArrowRight } from 'react-icons/fi'
import DirIcon from '../../components/common/DirIcon'

const SHELL = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'

const CARDS = [
  { to: '/annonces', icon: FiSearch, key: 'search' },
  { to: '/dashboard/candidatures', icon: FiClipboard, key: 'applications' },
  { to: '/dashboard/annonces', icon: FiFileText, key: 'myListings' },
  { to: '/dashboard/leads', icon: FiInbox, key: 'leads' },
  { to: '/dashboard/compte', icon: FiUser, key: 'account' },
]

function MonEspace({ user }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const firstName = user?.first_name || user?.full_name || ''
  return (
    <div className={SHELL}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {firstName ? t('dashboard:monEspace.greetingWithName', { name: firstName }) : t('dashboard:monEspace.greeting')}
        </h1>
        <p className="text-gray-600 mt-1">{t('dashboard:monEspace.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(({ to, icon: Icon, key }) => (
          <Link
            key={to}
            to={to}
            className="card p-5 group hover:shadow-md hover:border-primary-200 transition-all flex flex-col"
          >
            <div className="w-11 h-11 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center mb-3">
              <Icon className="w-5 h-5" />
            </div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-1">
              {t(`dashboard:monEspace.cards.${key}.title`)}
              <DirIcon icon={FiArrowRight} className="w-4 h-4 text-gray-300 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all" />
            </h2>
            <p className="text-sm text-gray-500 mt-1">{t(`dashboard:monEspace.cards.${key}.desc`)}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default MonEspace
