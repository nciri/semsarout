import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiBox } from 'react-icons/fi'

/**
 * Garde d'entitlement du module « conception 3D ». Sans le module, on n'affiche
 * pas une page vide ni une erreur : on explique ce qui manque et où l'activer.
 */
export default function Design3dGate({ hasFeature, children }) {
  const { t } = useTranslation(['dashboard'])
  if (hasFeature) return children
  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="card p-6 text-center">
        <FiBox className="w-10 h-10 mx-auto text-primary-600" />
        <h1 className="text-xl font-semibold text-gray-900 mt-3">{t('dashboard:designEditor.entitlement.title')}</h1>
        <p className="text-gray-600 mt-2">{t('dashboard:designEditor.entitlement.body')}</p>
        <Link to="/dashboard/compte/abonnement" className="btn-primary inline-flex min-h-[44px] items-center mt-4">
          {t('dashboard:designEditor.entitlement.cta')}
        </Link>
      </div>
    </div>
  )
}
