import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiMenu, FiX, FiUser, FiLogOut, FiPlus, FiGrid, FiFileText, FiSettings, FiCreditCard, FiLayers, FiLink } from 'react-icons/fi'
import useAuthStore from '../../store/authStore'
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

                      {/* Menu items */}
                      <div className="py-2">
                        <Link
                          to="/dashboard"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50"
                        >
                          <FiGrid className="w-4 h-4 mr-3 text-gray-400" />
                          Tableau de bord
                        </Link>
                        <Link
                          to="/dashboard/annonces"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50"
                        >
                          <FiFileText className="w-4 h-4 mr-3 text-gray-400" />
                          Mes annonces
                        </Link>
                        <Link
                          to="/dashboard/programmes"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50"
                        >
                          <FiLayers className="w-4 h-4 mr-3 text-gray-400" />
                          Programmes
                        </Link>
                        <Link
                          to="/dashboard/integrations/staymanager"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50"
                        >
                          <FiLink className="w-4 h-4 mr-3 text-gray-400" />
                          StayManager
                        </Link>
                        <Link
                          to="/dashboard/abonnement"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50"
                        >
                          <FiCreditCard className="w-4 h-4 mr-3 text-gray-400" />
                          Mon abonnement
                        </Link>
                        <Link
                          to="/dashboard/parametres"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50"
                        >
                          <FiSettings className="w-4 h-4 mr-3 text-gray-400" />
                          Paramètres
                        </Link>
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

                        {/* Social Login Buttons */}
                        <div className="space-y-2 mb-4">
                          <button className="w-full flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Continuer avec Google
                          </button>

                          <button className="w-full flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                            </svg>
                            Continuer avec Apple
                          </button>
                        </div>

                        <div className="relative mb-4">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200"></div>
                          </div>
                          <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">ou</span>
                          </div>
                        </div>

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
                  <Link
                    to="/dashboard"
                    className="py-2 text-gray-600"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Tableau de bord
                  </Link>
                  <Link
                    to="/dashboard/annonces"
                    className="py-2 text-gray-600"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Mes annonces
                  </Link>
                  <Link
                    to="/dashboard/programmes"
                    className="py-2 text-gray-600"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Mes programmes
                  </Link>
                  <Link
                    to="/dashboard/abonnement"
                    className="py-2 text-gray-600"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Mon abonnement
                  </Link>
                  <button
                    onClick={() => {
                      handleLogout()
                      setIsMenuOpen(false)
                    }}
                    className="py-2 text-left text-red-600"
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
