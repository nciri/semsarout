import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { FiLayers } from 'react-icons/fi'

// Barre d'onglets partagée entre « Mes annonces » (vente/location) et « Programmes immobiliers ».
// L'onglet Programmes a un contour doré pour le distinguer.
export default function MesBiensTabs() {
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
          En vente
        </Link>
        <Link to="/dashboard/annonces?transaction_type=rent" className={`${tab} ${isRent ? active : idle}`}>
          En location
        </Link>
        <Link
          to="/dashboard/programmes"
          className={`ml-2 mb-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
            onProgrammes
              ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-sm'
              : 'border-amber-400 text-amber-600 hover:bg-amber-50'
          }`}
        >
          <FiLayers className="w-4 h-4" />
          Programmes immobiliers
        </Link>
      </nav>
    </div>
  )
}
