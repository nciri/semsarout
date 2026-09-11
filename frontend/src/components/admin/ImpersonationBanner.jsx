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
  // Bandeau fixé : hors du flux normal de la page, il porte lui-même les marges de
  // zone sûre. Elles vont sur l'enveloppe (le fond amber couvre alors l'encoche), la
  // mise en forme restant sur le contenu.
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-midnight text-sm font-medium shadow
                    safe-top safe-inline">
      <div className="px-4 py-2 flex items-center justify-center gap-4">
        <span>{t('common:impersonation.loggedInAs', { name })}</span>
        <button onClick={exit} className="underline font-semibold">{t('common:impersonation.exit')}</button>
      </div>
    </div>
  )
}

export default ImpersonationBanner
