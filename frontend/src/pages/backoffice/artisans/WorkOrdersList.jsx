import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiLock, FiPlus, FiClipboard, FiTrash2 } from 'react-icons/fi'
import { artisanService } from '../../../services/artisanService'
import { ConfirmDialog, Modal, Select, DataTable, StatusBadge, EmptyState, GatedNotice, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS_TONE = {
  requested: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
}

const PRIMARY_BTN = 'inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50'

// Les cinq états d'une intervention, dans l'ordre où elle les traverse : la barre se lit
// comme son avancement, pas comme quatre nombres posés côte à côte.
const FLOW = [
  { status: 'requested', fill: 'bg-gray-300' },
  { status: 'scheduled', fill: 'bg-blue-500' },
  { status: 'in_progress', fill: 'bg-amber-500' },
  { status: 'done', fill: 'bg-emerald-500' },
  { status: 'cancelled', fill: 'bg-red-400' },
]

const NO_FILTER = { trade: '', q: '' }

/**
 * Avancement du parc d'interventions : barre empilée plus légende chiffrée. La barre est
 * décorative (`aria-hidden`) — c'est la légende qui porte les nombres, donc la lecture ne
 * dépend jamais de la seule couleur.
 */
function StatusFlow({ counts, total, label }) {
  const { t } = useTranslation(['backoffice'])
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline gap-2">
        <b className="font-display text-2xl font-extrabold leading-none tabular-nums">{total}</b>
        <span className="text-[13px] text-gray-500">{label}</span>
      </div>
      <div aria-hidden="true" className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-gray-100">
        {FLOW.filter((f) => counts[f.status]).map((f) => (
          <span key={f.status} className={`${f.fill} first:rounded-s-full last:rounded-e-full`}
            style={{ width: `${(counts[f.status] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {FLOW.map((f) => (
          <li key={f.status} className="flex items-center gap-1.5 text-[12.5px]">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${f.fill}`} />
            <span className="text-gray-600">{t(`backoffice:artisans.workOrder.status.${f.status}`)}</span>
            <b className="font-semibold tabular-nums text-gray-900">{counts[f.status] || 0}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WorkOrdersList({ filter = NO_FILTER }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery('work-orders', () => artisanService.listWorkOrders())
  const { data: tradesData } = useQuery('artisan-trades', () => artisanService.listTrades(), { staleTime: 3600000 })
  const [open, setOpen] = useState(false)
  // Le bon visé par la corbeille, en attente de confirmation ; null = fenêtre fermée.
  const [removing, setRemoving] = useState(null)
  const [title, setTitle] = useState('')
  const [trade, setTrade] = useState('plombier')
  const trades = tradesData?.trades || []
  const tradeLabel = (id) => trades.find((tr) => tr.id === id)?.label || id

  const fail = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))
  const create = useMutation(() => artisanService.createWorkOrder({ title, trade }), {
    onSuccess: () => {
      toast.success(t('backoffice:artisans.workOrder.toasts.created'))
      setTitle('')
      setOpen(false)
      qc.invalidateQueries('work-orders')
    },
    onError: fail,
  })
  // Le service décide qui retire quoi (rôle + statut) et renvoie `can_delete` : l'écran
  // n'affiche l'action que là où elle aboutira.
  const remove = useMutation((id) => artisanService.deleteWorkOrder(id), {
    onSuccess: () => {
      toast.success(t('backoffice:artisans.workOrder.toasts.deleted'))
      setRemoving(null)
      qc.invalidateQueries('work-orders')
    },
    onError: (e) => { setRemoving(null); fail(e) },
  })

  // Le filtre de l'onglet vaut aussi ici : chercher « Benali » doit sortir ses interventions,
  // pas seulement sa fiche d'artisan.
  const orders = useMemo(() => {
    const rows = data?.work_orders || []
    const known = tradesData?.trades || []
    const label = (id) => known.find((tr) => tr.id === id)?.label || id
    const s = (filter.q || '').trim().toLowerCase()
    return rows.filter((w) => (!filter.trade || w.trade === filter.trade)
      && (!s || [w.title, w.artisan?.name, label(w.trade)]
        .filter(Boolean).some((v) => v.toLowerCase().includes(s))))
  }, [data, tradesData, filter.trade, filter.q])
  const counts = useMemo(() => orders.reduce((acc, w) => ({ ...acc, [w.status]: (acc[w.status] || 0) + 1 }), {}),
    [orders])

  if (error?.response?.status === 403) {
    return <GatedNotice icon={FiLock} title={t('backoffice:artisans.workOrder.gated.title')} message={t('backoffice:artisans.workOrder.gated.message')} />
  }

  const columns = [
    { header: t('backoffice:artisans.workOrder.columns.title'), cell: (w) => (
      <Link className="text-primary-600 hover:text-primary-700 font-medium" to={`/backoffice/tiers/interventions/${w.id}`}>{w.title}</Link>
    ) },
    { header: t('backoffice:artisans.workOrder.columns.trade'), cell: (w) => <span className="text-gray-600">{tradeLabel(w.trade)}</span> },
    { header: t('backoffice:artisans.workOrder.columns.artisan'), cell: (w) => <span className="text-gray-600">{w.artisan?.name || '—'}</span> },
    { header: t('backoffice:artisans.workOrder.columns.costFinal'), align: 'right', cell: (w) => <span className="font-medium text-gray-900">{w.cost_final != null ? `${w.cost_final} Đh` : '—'}</span> },
    { header: t('backoffice:artisans.workOrder.columns.status'), cell: (w) => <StatusBadge label={t(`backoffice:artisans.workOrder.status.${w.status}`, { defaultValue: w.status })} className={STATUS_TONE[w.status]} /> },
    // impeccable-disable-next-line gray-on-color -- icône grise sur fond blanc ; le rouge n'est qu'un état :hover
    { header: '', align: 'right', cell: (w) => (w.can_delete ? (
      <button onClick={() => setRemoving(w)} disabled={remove.isLoading}
        title={t('backoffice:artisans.workOrder.delete')}
        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
        <FiTrash2 className="w-4 h-4" />
      </button>
    ) : null) },
  ]

  return (
    <div className="space-y-6">
      {orders.length > 0 && (
        <StatusFlow counts={counts} total={orders.length}
          label={t('backoffice:artisans.workOrder.flow.label', { count: orders.length })} />
      )}

      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className={PRIMARY_BTN}>
          <FiPlus className="w-5 h-5" /> {t('backoffice:artisans.workOrder.form.newButton')}
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        isLoading={isLoading}
        empty={<EmptyState icon={FiClipboard} title={t('backoffice:artisans.workOrder.empty.title')} description={t('backoffice:artisans.workOrder.empty.description')} />}
      />

      {/* Un retrait ne se rejoue pas : il se confirme dans une fenêtre du produit. */}
      <ConfirmDialog
        open={removing !== null}
        title={t('backoffice:artisans.workOrder.confirmDelete.title')}
        message={t('backoffice:artisans.workOrder.confirmDelete.message', {
          title: removing?.title,
          status: t(`backoffice:artisans.workOrder.status.${removing?.status}`, { defaultValue: removing?.status }),
        })}
        confirmLabel={t('backoffice:artisans.workOrder.confirmDelete.confirm')}
        cancelLabel={t('backoffice:artisans.workOrder.form.cancel')}
        busy={remove.isLoading}
        onCancel={() => setRemoving(null)}
        onConfirm={() => remove.mutate(removing.id)}
      />

      {/* La saisie quitte la page : une intervention se crée dans sa fenêtre, sans pousser
          la liste vers le bas. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('backoffice:artisans.workOrder.form.modalTitle')}
        footer={(
          <>
            <button onClick={() => setOpen(false)} className={SECONDARY_BTN}>{t('backoffice:artisans.workOrder.form.cancel')}</button>
            <button disabled={!title || create.isLoading} onClick={() => create.mutate()} className={PRIMARY_BTN}>
              {t('backoffice:artisans.workOrder.form.submit')}
            </button>
          </>
        )}
      >
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-title">
            {t('backoffice:artisans.workOrder.form.titleLabel')}
          </label>
          <input
            id="wo-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('backoffice:artisans.workOrder.form.titlePlaceholder')}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="wo-trade">
            {t('backoffice:artisans.workOrder.form.tradeLabel')}
          </label>
          <Select id="wo-trade" value={trade} onChange={(e) => setTrade(e.target.value)} className="w-full">
            {trades.map((tr) => <option key={tr.id} value={tr.id}>{tr.label}</option>)}
          </Select>
        </div>
      </Modal>
    </div>
  )
}
export default WorkOrdersList
