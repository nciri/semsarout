import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiLayers } from 'react-icons/fi'

// Barre d'onglets partagée entre « Mes annonces » (vente/location) et « Programmes immobiliers ».
// L'onglet Programmes a un contour doré pour le distinguer.
export default function MesBiensTabs() {
  const { t } = useTranslation(['dashboard'])
  const location = useLocation()
  const [params] = useSearchParams()

  const onAnnonces = location.pathname === '/dashboard/annonces'
  const onProgrammes = location.pathname.startsWith('/dashboard/programmes')
  const tx = params.get('transaction_type') === 'rent' ? 'rent' : 'sale'

  const isSale = onAnnonces && tx === 'sale'
  const isRent = onAnnonces && tx === 'rent'

  const tab = 'px-5 py-3 text-sm font-medium border-b-2 transition-colors'
  const active = 'border-primary-600 text-primary-600'
  const idle = 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'

  return (
    <div className="border-b border-gray-200 mb-4">
      <nav className="flex items-end gap-1 -mb-px">
        <Link to="/dashboard/annonces?transaction_type=sale" className={`${tab} ${isSale ? active : idle}`}>
          {t('dashboard:shared.mesBiensTabs.sale')}
        </Link>
        <Link to="/dashboard/annonces?transaction_type=rent" className={`${tab} ${isRent ? active : idle}`}>
          {t('dashboard:shared.mesBiensTabs.rent')}
        </Link>
        <Link
          to="/dashboard/programmes"
          className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
            onProgrammes ? active : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
          }`}
        >
          <FiLayers className="w-4 h-4" />
          {t('dashboard:shared.mesBiensTabs.programs')}
        </Link>
      </nav>
    </div>
  )
}
