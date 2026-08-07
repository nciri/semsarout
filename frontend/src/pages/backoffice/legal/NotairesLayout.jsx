import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/backoffice/ui'

const TABS = [
  { to: '', key: 'notaries', end: true },
  { to: 'dossiers', key: 'cases' },
]

function NotairesLayout() {
  const { t } = useTranslation(['backoffice'])
  return (
    <div className="space-y-6">
      <PageHeader title={t('backoffice:legal.layout.title')} subtitle={t('backoffice:legal.layout.subtitle')} />
      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t(`backoffice:legal.layout.tabs.${tab.key}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
export default NotairesLayout
