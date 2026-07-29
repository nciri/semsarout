import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '../../../components/backoffice/ui'

const TABS = [
  { to: '', label: 'Annuaire', end: true },
  { to: 'interventions', label: 'Interventions' },
]

function ArtisansLayout() {
  return (
    <div className="space-y-6">
      <PageHeader title="Artisans" subtitle="Votre référentiel d'artisans et le suivi des interventions sur vos biens" />
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
export default ArtisansLayout
