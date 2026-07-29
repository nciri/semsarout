import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { FiInbox, FiChevronRight } from 'react-icons/fi'
import { applicantService } from '../../services/rentalService'
import { formatPrice } from '../../utils/currency'
import { APP_STATUS } from './applicationStatus'

function MyApplications() {
  const { data, isLoading } = useQuery('my-applications', () => applicantService.myApplications())
  const apps = data?.applications || []

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mes candidatures</h1>
      <p className="text-gray-500 mb-6">Suivez l'état de vos dossiers de location.</p>
      {isLoading ? (
        <div className="text-gray-500">Chargement…</div>
      ) : apps.length === 0 ? (
        <div className="card p-12 text-center">
          <FiInbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">Aucune candidature</h3>
          <p className="text-gray-500">Trouvez un bien en location et déposez votre dossier depuis l'annonce.</p>
          <Link to="/annonces?transaction_type=rent" className="btn-primary mt-4">Voir les locations</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <Link key={a.id} to={`/dashboard/candidatures/${a.id}`}
              className="flex items-center justify-between card p-4 hover:shadow-md transition-shadow">
              <div>
                <p className="font-semibold text-gray-900">{a.property_title || `Bien #${a.property_id}`}</p>
                <p className="text-sm text-gray-500">Déposée le {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('fr-FR') : '—'}{a.monthly_income ? ` · revenus ${formatPrice(a.monthly_income)}` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${APP_STATUS[a.status]?.[1] || 'bg-gray-100 text-gray-700'}`}>{APP_STATUS[a.status]?.[0] || a.status}</span>
                <FiChevronRight className="w-5 h-5 text-gray-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
export default MyApplications
