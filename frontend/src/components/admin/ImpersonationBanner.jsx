import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

function ImpersonationBanner() {
  const { impersonating, impersonatedUser, stopImpersonation } = useAuthStore()
  const navigate = useNavigate()
  if (!impersonating) return null
  const name = impersonatedUser?.full_name || impersonatedUser?.email || 'utilisateur'
  const exit = () => { stopImpersonation(); navigate('/admin/comptes') }
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-midnight text-sm font-medium
                    px-4 py-2 flex items-center justify-center gap-4 shadow">
      <span>Connecté en tant que <strong>{name}</strong> (impersonation)</span>
      <button onClick={exit} className="underline font-semibold">Quitter</button>
    </div>
  )
}

export default ImpersonationBanner
