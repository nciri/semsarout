import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/backoffice/ui'

function ArtisansLayout() {
  const { t } = useTranslation(['backoffice', 'common'])
  const TABS = [
    { to: '', label: t('backoffice:artisans.layout.tabs.directory'), end: true },
    { to: 'interventions', label: t('backoffice:artisans.layout.tabs.interventions') },
  ]
  return (
    <div className="space-y-6">
      <PageHeader title={t('backoffice:artisans.shared.pageTitle')} subtitle={t('backoffice:artisans.layout.subtitle')} />
      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
export default ArtisansLayout
