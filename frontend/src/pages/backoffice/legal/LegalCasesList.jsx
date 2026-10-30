import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation, Trans } from 'react-i18next'
import { FiLock, FiPlus, FiShield, FiAlertCircle } from 'react-icons/fi'
import { legalService } from '../../../services/legalService'
import { StatCard, Select, DataTable, StatusBadge, EmptyState, GatedNotice, Modal, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS_TONE = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  closed: 'bg-emerald-50 text-emerald-700',
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50'

/** La recherche vient de l'onglet : un même mot cherche le notaire et ses dossiers. */
function LegalCasesList({ q = '' }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('legal-cases', () => legalService.listCases())
  const { data: notariesData } = useQuery('notaries', () => legalService.listNotaries())
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('sale')

  const create = useMutation(() => legalService.createCase({ title: title || undefined, case_type: type }), {
    onSuccess: () => {
      toast.success(t('backoffice:legal.shared.caseCreatedToast'))
      setTitle('')
      setOpen(false)
      qc.invalidateQueries('legal-cases')
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = data?.cases || []
  const cases = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return all
    return all.filter((c) => [c.title, c.notary?.name].filter(Boolean)
      .some((v) => v.toLowerCase().includes(s)))
  }, [all, q])
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
      <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/tiers/dossiers/${c.id}`}>{c.title}</Link>
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
              components={{ notariesLink: <Link to="/backoffice/tiers" className="underline font-medium" /> }}
            />
          </span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setOpen(true)}
          disabled={noNotary}
          title={noNotary ? t('backoffice:legal.cases.toolbar.noNotaryTooltip') : undefined}
          className={PRIMARY_BTN}
        >
          <FiPlus className="w-5 h-5" /> {t('backoffice:legal.cases.toolbar.newButton')}
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={cases}
        isLoading={isLoading}
        empty={<EmptyState icon={FiShield} title={t('backoffice:legal.cases.empty.title')} description={t('backoffice:legal.cases.empty.description')} />}
      />

      {/* La saisie quitte la page : un dossier se crée dans sa fenêtre, la liste reste en vue. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('backoffice:legal.cases.toolbar.modalTitle')}
        footer={(
          <>
            <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>{t('backoffice:legal.cases.toolbar.cancel')}</button>
            <button onClick={() => create.mutate()} disabled={create.isLoading || noNotary} className={PRIMARY_BTN}>
              {t('backoffice:legal.cases.toolbar.submit')}
            </button>
          </>
        )}
      >
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="case-title">
            {t('backoffice:legal.cases.toolbar.titleLabel')}
          </label>
          <input
            id="case-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('backoffice:legal.cases.toolbar.titlePlaceholder')}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="case-type">
            {t('backoffice:legal.cases.toolbar.typeLabel')}
          </label>
          <Select id="case-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full">
            <option value="sale">{t('backoffice:legal.shared.caseType.sale')}</option>
            <option value="rental">{t('backoffice:legal.shared.caseType.rental')}</option>
          </Select>
        </div>
      </Modal>
    </div>
  )
}
export default LegalCasesList
