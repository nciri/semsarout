import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useAuthStore from '../../store/authStore'

function ImpersonationBanner() {
  const { t } = useTranslation(['common'])
  const { impersonating, impersonatedUser, stopImpersonation } = useAuthStore()
  const navigate = useNavigate()
  if (!impersonating) return null
  const name = impersonatedUser?.full_name || impersonatedUser?.email || t('common:impersonation.defaultUser')
  const exit = () => { stopImpersonation(); navigate('/admin/comptes') }
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-midnight text-sm font-medium
                    px-4 py-2 flex items-center justify-center gap-4 shadow">
      <span>{t('common:impersonation.loggedInAs', { name })}</span>
      <button onClick={exit} className="underline font-semibold">{t('common:impersonation.exit')}</button>
    </div>
  )
}

export default ImpersonationBanner
