import { NavLink, Outlet } from 'react-router-dom'
import { FiBriefcase, FiCreditCard, FiSettings } from 'react-icons/fi'

const TABS = [
  { to: 'agence', label: 'Agence', icon: FiBriefcase },
  { to: 'abonnement', label: 'Abonnement', icon: FiCreditCard },
  { to: 'parametres', label: 'Paramètres', icon: FiSettings }
]

// Regroupe agence / abonnement / paramètres sous une seule entrée « Mon compte »
export default function AccountTabs() {
  return (
    <div>
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {TABS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <Outlet />
    </div>
  )
}
