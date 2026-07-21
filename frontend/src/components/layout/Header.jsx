import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from 'react-query'
import { FiMenu, FiX, FiUser, FiLogOut, FiPlus, FiGrid, FiFileText, FiLink, FiTrendingUp, FiInbox } from 'react-icons/fi'
import useAuthStore from '../../store/authStore'
import { leadService } from '../../services/leadService'
import Wordmark from '../common/Wordmark'

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const { isAuthenticated, user, logout } = useAuthStore()
  const navigate = useNavigate()
  const userMenuRef = useRef(null)

  const handleLogout = () => {
    logout()
    setIsUserMenuOpen(false)
    navigate('/')
  }

  const isAdmin = user?.user_type === 'admin' || user?.account_role === 'admin'

  // Compteur de demandes non lues (badge + point sur l'avatar)
  const { data: leadsSummary } = useQuery(
    'leads-summary',
    leadService.getSummary,
    { enabled: isAuthenticated, refetchInterval: 60000, refetchOnWindowFocus: true }
  )
  const unreadLeads = leadsSummary?.unread_count || 0

  // Groupes métier du menu compte (voir proposition de réorganisation)
  const menuSections = [
    {
      title: 'Activité',
      items: [
        { to: '/dashboard', label: 'Tableau de bord', icon: FiGrid },
        { to: '/dashboard/annonces', label: 'Mes annonces', icon: FiFileText },
        { to: '/dashboard/leads', label: 'Demandes / Leads', icon: FiInbox }
      ]
    },
    {
      title: 'Location courte durée',
      items: [
        { to: '/dashboard/staymanager', label: 'StayManager', icon: FiLink }
      ]
    },
    ...(isAdmin
      ? [{
          title: 'Administration',
          items: [
            { to: '/dashboard/prix-marche', label: 'Prix de référence', icon: FiTrendingUp }
          ]
        }]
      : []),
    {
      // Les 3 pages (agence / abonnement / paramètres) sont des onglets d'une même page
      title: null,
      items: [
        { to: '/dashboard/compte', label: 'Mon compte', icon: FiUser }
      ]
    }
  ]

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-50 bg-white/[.92] backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-[68px]">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <Wordmark />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center">
            {/* Primary nav - Acheter/Louer */}
            <div className="flex items-center space-x-6">
              <Link
                to="/annonces?transaction_type=sale"
                className="text-slate-700 hover:text-midnight font-semibold text-[15px] transition-colors"
              >
                Acheter
              </Link>
              <Link
                to="/annonces?transaction_type=rent"
                className="text-slate-700 hover:text-midnight font-semibold text-[15px] transition-colors"
              >
                Louer
              </Link>
            </div>

            {/* Separator */}
            <div className="mx-6 h-6 w-px bg-gray-200"></div>

            {/* Programmes neufs - Highlighted */}
            <Link
              to="/programmes"
              className="px-4 py-1.5 bg-midnight text-ivory font-semibold rounded-full hover:bg-slate-800 transition-all shadow-ds-sm hover:shadow-ds-md"
            >
              Programmes neufs
            </Link>

            {/* Separator */}
            <div className="mx-10 h-6 w-px bg-gray-200"></div>

            {/* Secondary nav - Agences & Services */}
            <div className="flex items-center space-x-6">
              <Link
                to="/agences"
                className="text-emerald-500 hover:text-emerald-600 font-semibold text-[15px] transition-colors"
              >
                Agences
              </Link>
              <Link
                to="/nos-services"
                className="text-emerald-500 hover:text-emerald-600 font-semibold text-[15px] transition-colors"
              >
                Nos Services
              </Link>
            </div>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-4">
            {isAuthenticated && (
              <Link
                to="/dashboard/annonces/nouvelle"
                className="btn-primary"
              >
                <FiPlus className="w-4 h-4 mr-2" />
                Déposer une annonce
              </Link>
            )}

            {/* User Icon with Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                aria-label="Menu utilisateur"
              >
                {isAuthenticated && user ? (
                  <span className="text-primary-600 font-semibold">
                    {user.first_name?.charAt(0)}{user.last_name?.charAt(0)}
                  </span>
                ) : (
                  <FiUser className="w-5 h-5 text-gray-600" />
                )}
                {/* Pastille : demandes non lues, visible menu fermé */}
                {isAuthenticated && unreadLeads > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold ring-2 ring-white">
                    {unreadLeads > 9 ? '9+' : unreadLeads}
                  </span>
                )}
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                  {isAuthenticated ? (
                    <>
                      {/* User info */}
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="font-medium text-gray-900">{user?.first_name} {user?.last_name}</p>
                        <p className="text-sm text-gray-500">{user?.email}</p>
                      </div>

                      {/* Menu items regroupés par domaine métier */}
                      <div className="py-1 max-h-[70vh] overflow-y-auto">
                        {menuSections.map((section) => (
                          <div key={section.title || section.items[0].to} className="py-1">
                            {section.title && (
                              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                {section.title}
                              </p>
                            )}
                            {section.items.map(({ to, label, icon: Icon }) => (
                              <Link
                                key={to}
                                to={to}
                                onClick={() => setIsUserMenuOpen(false)}
                                className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50"
                              >
                                <Icon className="w-4 h-4 mr-3 text-gray-400" />
                                <span className="flex-1">{label}</span>
                                {to === '/dashboard/leads' && unreadLeads > 0 && (
                                  <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-xs font-semibold">
                                    {unreadLeads > 99 ? '99+' : unreadLeads}
                                  </span>
                                )}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>

                      {/* Logout */}
                      <div className="border-t border-gray-100 pt-2">
                        <button
                          onClick={handleLogout}
                          className="flex items-center w-full px-4 py-2 text-red-600 hover:bg-red-50"
                        >
                          <FiLogOut className="w-4 h-4 mr-3" />
                          Déconnexion
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Login Form Preview */}
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-4">Connexion</h3>

                        {/* Email Login Link */}
                        <Link
                          to="/connexion"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="block w-full text-center px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                        >
                          Se connecter avec email
                        </Link>

                        {/* Register Link */}
                        <p className="text-center text-sm text-gray-600 mt-4">
                          Pas encore de compte ?{' '}
                          <Link
                            to="/inscription"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="text-primary-600 hover:text-primary-700 font-medium"
                          >
                            Créer un compte
                          </Link>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <FiX className="w-6 h-6" /> : <FiMenu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <nav className="flex flex-col space-y-2">
              <Link
                to="/annonces?transaction_type=sale"
                className="py-2 text-gray-700 font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Acheter
              </Link>
              <Link
                to="/annonces?transaction_type=rent"
                className="py-2 text-gray-700 font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Louer
              </Link>
              <div className="h-px bg-gray-200 my-2"></div>
              <Link
                to="/programmes"
                className="inline-block my-2 px-4 py-2 bg-gradient-to-r from-terracotta-500 to-terracotta-600 text-white font-semibold rounded-full"
                onClick={() => setIsMenuOpen(false)}
              >
                Programmes neufs
              </Link>
              <div className="h-px bg-gray-200 my-2"></div>
              <Link
                to="/agences"
                className="py-2 text-gray-600 font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Agences
              </Link>
              <Link
                to="/nos-services"
                className="py-2 text-gray-600 font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Nos Services
              </Link>
              <div className="h-px bg-gray-200 my-2"></div>
              {isAuthenticated ? (
                <>
                  {menuSections.map((section) => (
                    <div key={section.title || section.items[0].to}>
                      {section.title && (
                        <p className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          {section.title}
                        </p>
                      )}
                      {section.items.map(({ to, label, icon: Icon }) => (
                        <Link
                          key={to}
                          to={to}
                          className="flex items-center gap-3 py-2 text-gray-600"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <Icon className="w-4 h-4 text-gray-400" />
                          <span className="flex-1">{label}</span>
                          {to === '/dashboard/leads' && unreadLeads > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-xs font-semibold">
                              {unreadLeads > 99 ? '99+' : unreadLeads}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      handleLogout()
                      setIsMenuOpen(false)
                    }}
                    className="py-2 mt-2 text-left text-red-600 border-t border-gray-200"
                  >
                    Déconnexion
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/connexion"
                    className="py-2 text-gray-600"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Connexion
                  </Link>
                  <Link
                    to="/inscription"
                    className="py-2 text-primary-600 font-medium"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Créer un compte
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}

export default Header
