import { useState } from 'react'
import { Link, useLocation, Outlet } from 'react-router-dom'
import {
  FiHome, FiUsers, FiFileText, FiCalendar, FiDollarSign,
  FiSettings, FiBarChart2, FiMenu, FiX, FiBriefcase,
  FiUserCheck, FiGrid, FiMail, FiLogOut, FiBell, FiSearch,
  FiChevronDown, FiExternalLink, FiTrendingUp
} from 'react-icons/fi'
import useAuthStore from '../../../store/authStore'

const MENU_ITEMS = [
  {
    section: 'Principal',
    items: [
      { path: '/backoffice', icon: FiHome, label: 'Tableau de bord', exact: true },
      { path: '/backoffice/biens', icon: FiFileText, label: 'Biens immobiliers' },
      { path: '/backoffice/pipeline', icon: FiGrid, label: 'Pipeline' },
    ]
  },
  {
    section: 'CRM',
    items: [
      { path: '/backoffice/clients', icon: FiUsers, label: 'Clients' },
      { path: '/backoffice/leads', icon: FiMail, label: 'Leads' },
      { path: '/backoffice/visites', icon: FiCalendar, label: 'Visites & RDV' },
    ]
  },
  {
    section: 'Finance',
    items: [
      { path: '/backoffice/transactions', icon: FiBriefcase, label: 'Transactions' },
      { path: '/backoffice/contrats', icon: FiFileText, label: 'Contrats' },
      { path: '/backoffice/notaires', icon: FiBriefcase, label: 'Notaires' },
    ]
  },
  {
    section: 'Administration',
    items: [
      { path: '/backoffice/equipe', icon: FiUserCheck, label: 'Équipe' },
      { path: '/backoffice/analyses', icon: FiTrendingUp, label: 'Analyses' },
      { path: '/backoffice/statistiques', icon: FiBarChart2, label: 'Statistiques' },
      { path: '/backoffice/parametres', icon: FiSettings, label: 'Paramètres' },
      { path: '/backoffice/stripe', icon: FiDollarSign, label: 'Stripe', adminOnly: true },
    ]
  }
]

export default function BackofficeLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const isActive = (path, exact = false) => {
    if (exact) return location.pathname === path
    return location.pathname.startsWith(path)
  }

  const NavLink = ({ item }) => {
    const Icon = item.icon
    const active = isActive(item.path, item.exact)

    return (
      <Link
        to={item.path}
        onClick={() => setMobileMenuOpen(false)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          active
            ? 'bg-primary-50 text-primary-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <Icon className={`w-5 h-5 ${active ? 'text-primary-600' : 'text-gray-400'}`} />
        {sidebarOpen && <span>{item.label}</span>}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-gray-500 hover:text-gray-700"
          >
            <FiMenu className="w-6 h-6" />
          </button>
          <Link to="/backoffice" className="font-display font-bold text-lg text-primary-600">
            SemsarOut
          </Link>
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-500 hover:text-gray-700 relative">
              <FiBell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-display font-bold text-lg text-primary-600">SemsarOut</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-80px)]">
              {MENU_ITEMS.map(section => {
                const filteredItems = section.items.filter(item => !item.adminOnly || user?.role === 'admin')
                if (filteredItems.length === 0) return null
                return (
                  <div key={section.section}>
                    <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      {section.section}
                    </p>
                    <div className="space-y-1">
                      {filteredItems.map(item => (
                        <NavLink key={item.path} item={item} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-40 bg-white border-r border-gray-200 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          {sidebarOpen ? (
            <Link to="/backoffice" className="font-display font-bold text-xl text-primary-600">
              SemsarOut
            </Link>
          ) : (
            <Link to="/backoffice" className="font-display font-bold text-xl text-primary-600 mx-auto">
              S
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <FiMenu className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {MENU_ITEMS.map(section => {
            const filteredItems = section.items.filter(item => !item.adminOnly || user?.role === 'admin')
            if (filteredItems.length === 0) return null
            return (
              <div key={section.section}>
                {sidebarOpen && (
                  <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {section.section}
                  </p>
                )}
                <div className="space-y-1">
                  {filteredItems.map(item => (
                    <NavLink key={item.path} item={item} />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-200">
          <div className={`flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'}`}>
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-primary-600">
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </span>
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button
              onClick={logout}
              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FiLogOut className="w-4 h-4" />
              <span>Déconnexion</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className={`lg:transition-all lg:duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        {/* Top bar */}
        <header className="hidden lg:flex items-center justify-between h-16 px-6 bg-white border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher..."
                className="pl-10 pr-4 py-2 w-64 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <FiBell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="relative flex items-center gap-2 pl-4 border-l border-gray-200">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary-600">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </span>
              </div>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
              >
                <span>{user?.first_name}</span>
                <FiChevronDown className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* User Dropdown Menu */}
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="font-medium text-gray-900">{user?.first_name} {user?.last_name}</p>
                      <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <div className="py-2">
                      <Link
                        to="/backoffice/parametres"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <FiSettings className="w-4 h-4 text-gray-400" />
                        Paramètres agence
                      </Link>
                      <Link
                        to="/"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <FiHome className="w-4 h-4 text-gray-400" />
                        Retour au site
                      </Link>
                    </div>
                    <div className="border-t border-gray-100 pt-2">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false)
                          logout()
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <FiLogOut className="w-4 h-4" />
                        Déconnexion
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="p-4 lg:p-6 pt-20 lg:pt-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
