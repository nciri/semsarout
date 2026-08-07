import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation, Trans } from 'react-i18next'
import { FiLock, FiPlus, FiShield, FiAlertCircle } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'
import { StatCard, Toolbar, Select, DataTable, StatusBadge, EmptyState, GatedNotice } from '../../../components/backoffice/ui'

const STATUS_TONE = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  closed: 'bg-emerald-50 text-emerald-700',
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50'

function LegalCasesList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('legal-cases', () => legalService.listCases())
  const { data: notariesData } = useQuery('notaries', () => legalService.listNotaries())
  const [title, setTitle] = useState('')
  const [type, setType] = useState('sale')

  const create = useMutation(() => legalService.createCase({ title: title || undefined, case_type: type }), {
    onSuccess: () => { toast.success(t('backoffice:legal.shared.caseCreatedToast')); setTitle(''); qc.invalidateQueries('legal-cases') },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cases = data?.cases || []
  const notaries = notariesData?.notaries || []
  const noNotary = notaries.length === 0
  const stats = useMemo(() => ({
    total: cases.length,
    open: cases.filter((c) => c.status === 'open').length,
    in_progress: cases.filter((c) => c.status === 'in_progress').length,
    closed: cases.filter((c) => c.status === 'closed').length,
  }), [cases])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title={t('backoffice:legal.cases.gated.title')} message={t('backoffice:legal.cases.gated.message')} />
  }

  const columns = [
    { header: t('backoffice:legal.cases.columns.title'), cell: (c) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/notaires/dossiers/${c.id}`}>{c.title}</Link>
    ) },
    { header: t('backoffice:legal.cases.columns.type'), cell: (c) => <span className="text-gray-600">{t(`backoffice:legal.shared.caseType.${c.case_type}`, { defaultValue: c.case_type })}</span> },
    { header: t('backoffice:legal.cases.columns.notary'), cell: (c) => <span className="text-gray-600">{c.notary?.name || '—'}</span> },
    { header: t('backoffice:legal.cases.columns.progress'), cell: (c) => {
      const pct = c.tasks_total ? Math.round((c.tasks_done / c.tasks_total) * 100) : 0
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-gray-500 tabular-nums">{c.tasks_done}/{c.tasks_total}</span>
        </div>
      )
    } },
    { header: t('backoffice:legal.cases.columns.status'), cell: (c) => <StatusBadge label={t(`backoffice:legal.shared.status.${c.status}`, { defaultValue: c.status })} className={STATUS_TONE[c.status]} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t('backoffice:legal.cases.stats.total')} value={stats.total} icon={FiShield} />
        <StatCard label={t('backoffice:legal.cases.stats.open')} value={stats.open} tone="blue" />
        <StatCard label={t('backoffice:legal.cases.stats.in_progress')} value={stats.in_progress} tone="amber" />
        <StatCard label={t('backoffice:legal.cases.stats.closed')} value={stats.closed} tone="green" />
      </div>

      {noNotary && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            <Trans
              i18nKey="backoffice:legal.cases.noNotary"
              components={{ notariesLink: <Link to="/backoffice/notaires" className="underline font-medium" /> }}
            />
          </span>
        </div>
      )}

      <Toolbar>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('backoffice:legal.cases.toolbar.titlePlaceholder')}
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="sale">{t('backoffice:legal.shared.caseType.sale')}</option>
          <option value="rental">{t('backoffice:legal.shared.caseType.rental')}</option>
        </Select>
        <button
          onClick={() => create.mutate()}
          disabled={create.isLoading || noNotary}
          title={noNotary ? t('backoffice:legal.cases.toolbar.noNotaryTooltip') : undefined}
          className={PRIMARY_BTN}
        >
          <FiPlus className="w-5 h-5" /> {t('backoffice:legal.cases.toolbar.newButton')}
        </button>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={cases}
        isLoading={isLoading}
        empty={<EmptyState icon={FiShield} title={t('backoffice:legal.cases.empty.title')} description={t('backoffice:legal.cases.empty.description')} />}
      />
    </div>
  )
}
export default LegalCasesList
