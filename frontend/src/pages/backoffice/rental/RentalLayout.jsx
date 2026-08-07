import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/backoffice/ui'

function RentalLayout() {
  const { t } = useTranslation(['backoffice', 'common'])
  const TABS = [
    { to: '', label: t('backoffice:rental.layout.tabs.mandates'), end: true },
    { to: 'baux', label: t('backoffice:rental.layout.tabs.leases') },
    { to: 'candidatures', label: t('backoffice:rental.layout.tabs.applications') },
  ]
  return (
    <div className="space-y-6">
      <PageHeader title={t('backoffice:rental.shared.pageTitle')} subtitle={t('backoffice:rental.layout.subtitle')} />
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
export default RentalLayout
