import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '../../../components/backoffice/ui'

const TABS = [
  { to: '', label: 'Mandats', end: true },
  { to: 'baux', label: 'Baux' },
  { to: 'candidatures', label: 'Candidatures' },
]

function RentalLayout() {
  return (
    <div className="space-y-6">
      <PageHeader title="Gestion locative" subtitle="Mandats de gestion, baux & quittancement, candidatures locatives" />
      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <NavLink
            key={t.label}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
export default RentalLayout
