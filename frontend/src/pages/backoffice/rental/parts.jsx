import { useState } from 'react'
import { useMutation } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { rentalService } from '../../../services/rentalService'
import { Field, Modal, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'
import { Chip } from '../components/kit'
import { ageTone, dueTone } from './model'
import { useRentalRefresh } from './hooks'

export function AgeChip({ days, lo, hi }) {
  const { t } = useTranslation('backoffice')
  return <Chip tone={ageTone(days, lo, hi)}>{t('dashboard.units.days', { count: days })}</Chip>
}

export function DueChip({ days }) {
  const { t } = useTranslation('backoffice')
  return <Chip tone={dueTone(days)}>{days === 0 ? t('rental.overview.today') : t('rental.overview.inDays', { count: days })}</Chip>
}

/** Saisie d'un paiement sur une échéance ; montant proposé : ce qui reste dû. */
export function PayModal({ period, onClose }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const refresh = useRentalRefresh()
  const [form, setForm] = useState({ amount: String(period.rest ?? period.total_amount ?? ''), method: 'virement' })
  const pay = useMutation(() => rentalService.payRentPeriod(period.id, { amount: Number(form.amount), method: form.method }), {
    onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.paymentRecorded')); onClose(); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  return (
    <Modal open onClose={onClose} title={t('backoffice:rental.lease.payModal.title', { period: period.period_label || '' })}
      footer={<>
        <button onClick={onClose} className={SECONDARY_BTN}>{t('backoffice:rental.lease.payModal.cancel')}</button>
        <button disabled={!form.amount || pay.isLoading} onClick={() => pay.mutate()} className={PRIMARY_BTN}>{t('backoffice:rental.lease.payModal.submit')}</button>
      </>}>
      <Field label={t('backoffice:rental.lease.payModal.amountLabel')} type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.lease.payModal.methodLabel')}</label>
        <Select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} className="w-full">
          {['virement', 'cheque', 'especes', 'carte'].map((m) => <option key={m} value={m}>{t(`backoffice:rental.lease.payModal.methods.${m}`)}</option>)}
        </Select>
      </div>
    </Modal>
  )
}

/** Petit titre de section des vues détaillées. */
export function H3({ children }) {
  return <h3 className="font-display text-[13px] font-bold">{children}</h3>
}

/** Détail déplié sous sa rangée : même mécanique que le tableau de bord (un seul ouvert, Échap). */
export function DetailRegion({ shown, notch, children }) {
  return (
    <div id="rental-detail" role="region" aria-labelledby="dashboard-detail-title"
      className="col-span-full grid transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: shown ? '1fr' : '0fr' }}>
      <div className="min-h-0 overflow-hidden pt-2.5">
        <div className="relative rounded-xl border border-primary-400 bg-white shadow-[0_1px_2px_rgba(11,18,32,.04),0_14px_30px_-20px_rgba(11,18,32,.25)]">
          <span aria-hidden="true" className="absolute -top-[8px] h-3.5 w-3.5 -ms-[7px] rotate-45 border-s border-t border-primary-400 bg-white" style={{ insetInlineStart: notch }} />
          {children}
        </div>
      </div>
    </div>
  )
}
