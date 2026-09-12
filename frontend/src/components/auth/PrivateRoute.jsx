import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from 'react-query'
import useAuthStore from '../../store/authStore'
import api from '../../services/api'

// Seuls chemins ouverts à une agence en accès réduit : sa page d'abonnement et le parcours de
// paiement. Tout le reste la ramène à l'abonnement — confort d'interface uniquement, le blocage
// réel étant côté serveur (droits de plan révoqués, `require_feature`).
const BILLING_PATHS = ['/dashboard/compte', '/checkout', '/payment-gateway']

function PrivateRoute() {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()
  const isAgency = user?.user_type === 'professional' || user?.user_type === 'admin'
  // Même clé que la page d'abonnement : une seule requête, un seul cache.
  const { data } = useQuery(
    'currentSubscription',
    async () => (await api.get('/subscription/current')).data,
    { enabled: isAuthenticated && isAgency },
  )

  if (!isAuthenticated) {
    return <Navigate to="/connexion" state={{ from: location }} replace />
  }
  if (data?.subscription?.status === 'restricted'
      && !BILLING_PATHS.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to="/dashboard/compte/abonnement" replace />
  }
  return <Outlet />
}

export default PrivateRoute
