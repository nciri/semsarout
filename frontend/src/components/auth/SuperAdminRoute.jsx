import { Navigate, Outlet, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

function SuperAdminRoute() {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/connexion" state={{ from: location }} replace />
  }
  if (!user?.is_superadmin) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

export default SuperAdminRoute
