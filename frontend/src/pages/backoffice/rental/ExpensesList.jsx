import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiCheckCircle, FiExternalLink, FiTool } from 'react-icons/fi'
import { artisanService } from '../../../services/artisanService'
import { useConfirm } from '../../../components/common/confirm'
import { DataTable, EmptyState, Modal, PRIMARY_BTN, Select, SECONDARY_BTN } from '../../../components/backoffice/ui'
import { Alert, Chip, IconAction } from '../components/kit'
import { matches } from './model'
import { AgeChip } from './parts'
import { useRentalFormat } from './hooks'

const SLEEPING_DAYS = 60
const OPEN_METHODS = ['encaisse', 'regularisation']
// Ces deux modes renoncent à l'argent de l'agence : le serveur les réserve à l'administration
// et le dit par ligne (`can_settle_writeoff`).
const GIVES_UP = ['impute_commission', 'abandonne']

function ExpensesList() {
  const { t } = useTranslation(['backoffice', 'common'])
  const f = useRentalFormat()
  const ask = useConfirm()
  const qc = useQueryClient()
  const ctx = useOutletContext()
  const [settling, setSettling] = useState(null)
  const [method, setMethod] = useState('')
  const { data, isLoading, error } = useQuery('rental-expenses', () => artisanService.listPendingWorkOrders())

  const settle = useMutation(({ id, method }) => artisanService.settleWorkOrder(id, { method }), {
    onSuccess: () => { toast.success(t('backoffice:rental.expenses.toasts.settled')); qc.invalidateQueries('rental-expenses') },
    // Filet si le drapeau et la route divergeaient : un refus se dit en clair.
    onError: (e) => {
      // Un refus « déjà soldé » laisse une ligne périmée : on relit la liste.
      if (e.response?.status === 409) qc.invalidateQueries('rental-expenses')
      toast.error(e.response?.status === 403
        ? t('backoffice:rental.expenses.toasts.forbidden')
        : e.response?.data?.error || t('common:errors.short'))
    },
  })

  const closeModal = () => { setSettling(null); setMethod('') }

  const proceed = () => {
    const wo = settling
    closeModal()
    ask({
      message: t('backoffice:rental.expenses.confirm', { title: wo.title, amount: f.dh(wo.cost_final), method: t(`backoffice:rental.expenses.methods.${method}`) }),
      confirmLabel: t('backoffice:rental.expenses.confirmLabel'),
      tone: GIVES_UP.includes(method) ? 'danger' : 'primary',
      onConfirm: () => settle.mutate({ id: wo.id, method }),
    })
  }

  if (error) return <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-500">{t('backoffice:rental.shared.loadError')}</div>

  const all = data?.work_orders || []
  const rows = all.filter((w) => matches(ctx?.query || '', w.title))
  // Garde-fou : compte toutes les dépenses en attente, pas seulement celles que la recherche laisse voir.
  const sleeping = all.filter((w) => w.waiting_days > SLEEPING_DAYS).length
  const detail = (w) => `/backoffice/tiers/interventions/${w.id}`

  const columns = [
    { header: t('backoffice:rental.expenses.columns.title'), cell: (w) => <b className="font-semibold">{w.title}</b> },
    { header: t('backoffice:rental.expenses.columns.cost'), align: 'right', className: 'tabular-nums', cell: (w) => f.dh(w.cost_final) },
    {
      header: t('backoffice:rental.expenses.columns.mode'),
      cell: (w) => (w.charge_mode
        ? t(`backoffice:artisans.workOrder.chargeMode.${w.charge_mode}`)
        : <Chip tone="warn">{t('backoffice:rental.expenses.toChoose')}</Chip>),
    },
    { header: t('backoffice:rental.expenses.columns.age'), cell: (w) => <AgeChip days={w.waiting_days} lo={30} hi={SLEEPING_DAYS} /> },
    {
      header: <span className="sr-only">{t('backoffice:rental.overview.actions')}</span>,
      align: 'right',
      cell: (w) => (w.charge_mode === 'to_rebill'
        ? <IconAction icon={FiCheckCircle} label={t('backoffice:rental.expenses.settle', { title: w.title })} onClick={() => setSettling(w)} tone="primary" tipAlign="end" />
        : <IconAction icon={FiExternalLink} to={detail(w)} tone="gold" tipAlign="end"
          label={t(w.charge_mode ? 'backoffice:rental.expenses.open' : 'backoffice:rental.expenses.choose', { title: w.title })} />),
    },
  ]

  return (
    <div className="grid gap-3">
      {sleeping > 0 && (
        <div role="alert">
          <Alert tone="crit" icon={FiAlertTriangle}>
            <b className="font-semibold">{t('backoffice:rental.expenses.alert', { count: sleeping })}</b>
            <span className="block">{t('backoffice:rental.expenses.alertHint')}</span>
          </Alert>
        </div>
      )}
      <DataTable columns={columns} rows={rows} isLoading={isLoading}
        empty={<EmptyState icon={FiTool} title={t('backoffice:rental.expenses.empty.title')} description={t('backoffice:rental.expenses.empty.description')} />} />

      <Modal open={settling !== null} onClose={closeModal} title={t('backoffice:rental.expenses.modal.title', { title: settling?.title })}
        footer={<>
          <button onClick={closeModal} className={SECONDARY_BTN}>{t('backoffice:rental.expenses.modal.cancel')}</button>
          <button onClick={proceed} disabled={!method} className={PRIMARY_BTN}>{t('backoffice:rental.expenses.modal.continue')}</button>
        </>}>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          {t('backoffice:rental.expenses.modal.how')}
          <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full">
            <option value="">{t('backoffice:rental.expenses.modal.placeholder')}</option>
            {(settling?.can_settle_writeoff ? [...OPEN_METHODS, ...GIVES_UP] : OPEN_METHODS).map((m) => <option key={m} value={m}>{t(`backoffice:rental.expenses.methods.${m}`)}</option>)}
          </Select>
        </label>
      </Modal>
    </div>
  )
}
export default ExpensesList
