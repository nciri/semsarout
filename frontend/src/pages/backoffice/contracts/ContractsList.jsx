import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { FiFilePlus, FiLock, FiFileText, FiLayout } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'
import { PageHeader, StatCard, DataTable, StatusBadge, EmptyState, GatedNotice } from '../../../components/backoffice/ui'

const STATUS = {
  draft: ['Brouillon', 'bg-gray-100 text-gray-700'],
  finalized: ['Finalisé', 'bg-blue-100 text-blue-700'],
  signed: ['Signé', 'bg-emerald-50 text-emerald-700'],
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors'

function ContractsList() {
  const { data, isLoading, error } = useQuery('contracts', () => contractService.list())
  const rows = data?.contracts || []
  const stats = useMemo(() => ({
    total: rows.length,
    draft: rows.filter((c) => c.status === 'draft').length,
    finalized: rows.filter((c) => c.status === 'finalized').length,
    signed: rows.filter((c) => c.status === 'signed').length,
  }), [rows])

  if (error?.response?.status === 403) {
    return (
      <GatedNotice
        icon={FiLock}
        title="Contrats"
        message="L'édition de contrats est réservée aux plans Pro et Entreprise."
      />
    )
  }

  const columns = [
    { header: 'Titre', className: 'font-medium', cell: (c) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/contrats/${c.id}`}>{c.title}</Link>
    ) },
    { header: 'Type', cell: (c) => <span className="text-gray-600">{c.document_type}</span> },
    { header: 'Statut', cell: (c) => <StatusBadge label={STATUS[c.status]?.[0] || c.status} className={STATUS[c.status]?.[1]} /> },
    { header: 'Créé le', cell: (c) => <span className="text-gray-500">{c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '—'}</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Contrats" subtitle="Rédigez et gérez les contrats de vos transactions">
        <Link to="/backoffice/contrats/modeles" className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
          <FiLayout className="w-5 h-5" /> Modèles
        </Link>
        <Link to="/backoffice/contrats/nouveau" className={PRIMARY_BTN}>
          <FiFilePlus className="w-5 h-5" /> Nouveau contrat
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total" value={stats.total} icon={FiFileText} />
        <StatCard label="Brouillons" value={stats.draft} tone="default" />
        <StatCard label="Finalisés" value={stats.finalized} tone="blue" />
        <StatCard label="Signés" value={stats.signed} tone="green" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        empty={(
          <EmptyState
            icon={FiFileText}
            title="Aucun contrat"
            description="Créez votre premier contrat à partir d'un modèle ou d'une page vierge."
            action={<Link to="/backoffice/contrats/nouveau" className={PRIMARY_BTN}><FiFilePlus className="w-5 h-5" /> Nouveau contrat</Link>}
          />
        )}
      />
    </div>
  )
}
export default ContractsList
