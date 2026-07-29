import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { FiLock, FiInbox } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { StatCard, DataTable, StatusBadge, EmptyState, GatedNotice } from '../../../components/backoffice/ui'

const STATUS = {
  received: ['Reçue', 'bg-blue-100 text-blue-700'],
  reviewing: ['En étude', 'bg-amber-100 text-amber-700'],
  accepted: ['Acceptée', 'bg-emerald-50 text-emerald-700'],
  rejected: ['Refusée', 'bg-red-100 text-red-700'],
  withdrawn: ['Retirée', 'bg-gray-100 text-gray-700'],
}

function ApplicationsList() {
  const { data, isLoading, error } = useQuery('rental-applications', () => rentalService.listApplications())
  const apps = data?.applications || []
  const stats = useMemo(() => ({ total: apps.length, received: apps.filter((a) => a.status === 'received').length, accepted: apps.filter((a) => a.status === 'accepted').length }), [apps])
  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title="Candidatures" message="La gestion locative est réservée aux plans Pro et Entreprise." />
  if (error) return <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">Une erreur est survenue lors du chargement. Réessayez plus tard.</div>

  const columns = [
    { header: 'Candidat', cell: (a) => <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/gestion-locative/candidatures/${a.id}`}>{a.applicant_name || a.applicant_email || `#${a.id}`}</Link> },
    { header: 'Bien (ID)', cell: (a) => <span className="text-gray-600">{a.property_id}</span> },
    { header: 'Revenu mensuel', align: 'right', cell: (a) => <span className="text-gray-700">{a.monthly_income != null ? `${a.monthly_income} Đh` : '—'}</span> },
    { header: 'Statut', cell: (a) => <StatusBadge label={STATUS[a.status]?.[0] || a.status} className={STATUS[a.status]?.[1]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total" value={stats.total} icon={FiInbox} />
        <StatCard label="Nouvelles" value={stats.received} tone="blue" />
        <StatCard label="Acceptées" value={stats.accepted} tone="green" />
      </div>
      <DataTable columns={columns} rows={apps} isLoading={isLoading}
        empty={<EmptyState icon={FiInbox} title="Aucune candidature" description="Les dossiers déposés par les candidats sur vos biens apparaissent ici." />} />
    </div>
  )
}
export default ApplicationsList
