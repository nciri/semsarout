import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiFilePlus, FiLock, FiFileText, FiLayout } from 'react-icons/fi'
import { contractService } from '../../../services/contractService'
import { PageHeader, StatCard, DataTable, StatusBadge, EmptyState, GatedNotice } from '../../../components/backoffice/ui'
import { useFormat } from '../../../utils/format'

const STATUS_TONE = {
  draft: 'bg-gray-100 text-gray-700',
  finalized: 'bg-blue-100 text-blue-700',
  signed: 'bg-emerald-50 text-emerald-700',
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors'

function ContractsList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { fmtDate } = useFormat()
  const { data, isLoading, error } = useQuery('contracts', () => contractService.list())
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        title={t('backoffice:contracts.list.gated.title')}
        message={t('backoffice:contracts.list.gated.message')}
      />
    )
  }

  const columns = [
    { header: t('backoffice:contracts.list.columns.title'), className: 'font-medium', cell: (c) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/contrats/${c.id}`}>{c.title}</Link>
    ) },
    { header: t('backoffice:contracts.list.columns.type'), cell: (c) => <span className="text-gray-600">{c.document_type}</span> },
    { header: t('backoffice:contracts.list.columns.status'), cell: (c) => <StatusBadge label={t(`backoffice:contracts.status.${c.status}`, { defaultValue: c.status })} className={STATUS_TONE[c.status]} /> },
    { header: t('backoffice:contracts.list.columns.createdAt'), cell: (c) => <span className="text-gray-500">{c.created_at ? fmtDate(c.created_at) : '—'}</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title={t('backoffice:contracts.list.pageTitle')} subtitle={t('backoffice:contracts.list.subtitle')}>
        <Link to="/backoffice/contrats/modeles" className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
          <FiLayout className="w-5 h-5" /> {t('backoffice:contracts.list.templatesButton')}
        </Link>
        <Link to="/backoffice/contrats/nouveau" className={PRIMARY_BTN}>
          <FiFilePlus className="w-5 h-5" /> {t('backoffice:contracts.list.newButton')}
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t('backoffice:contracts.list.stats.total')} value={stats.total} icon={FiFileText} />
        <StatCard label={t('backoffice:contracts.list.stats.draft')} value={stats.draft} tone="default" />
        <StatCard label={t('backoffice:contracts.list.stats.finalized')} value={stats.finalized} tone="blue" />
        <StatCard label={t('backoffice:contracts.list.stats.signed')} value={stats.signed} tone="green" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        empty={(
          <EmptyState
            icon={FiFileText}
            title={t('backoffice:contracts.list.empty.title')}
            description={t('backoffice:contracts.list.empty.description')}
            action={<Link to="/backoffice/contrats/nouveau" className={PRIMARY_BTN}><FiFilePlus className="w-5 h-5" /> {t('backoffice:contracts.list.newButton')}</Link>}
          />
        )}
      />
    </div>
  )
}
export default ContractsList
