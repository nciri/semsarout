import { useState } from 'react'
import { useMutation, useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiCheckCircle, FiClock, FiDollarSign, FiDownload, FiEdit3, FiExternalLink, FiFileText, FiPlus, FiRotateCcw, FiTrendingUp } from 'react-icons/fi'
import { rentalService } from '../../../services/rentalService'
import { Field, Modal, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import { Alert, Chip, DetailColumns, IconAction, Kv, Legend, Rich, TD, TH } from '../components/kit'
import { INVENTORY_TONE, STATE_TONE, dayDiff, leaseFindings, periodState } from './model'
import { H3, PayModal } from './parts'
import { openPdf, useRentalFormat, useRentalRefresh } from './hooks'

const FRISE_MONTHS = 7
const FRISE_STYLE = {
  paid: 'bg-green-50 text-green-700 border-transparent',
  paid_late: 'bg-green-50 text-green-700 border-[#F2C999]',
  partial: 'bg-amber-50 text-amber-700 border-transparent',
  late: 'bg-red-50 text-red-700 border-transparent',
  upcoming: 'bg-white text-gray-500 border-dashed border-gray-200',
}
const FINDING_ICON = { owed: FiAlertCircle, paysLate: FiClock, entryMissing: FiFileText, entryUnsigned: FiFileText, ending: FiClock }

/** Frise des échéances : un carreau par mois, couleur = état du paiement. */
function Frise({ periods, now }) {
  const { t } = useTranslation('backoffice')
  const f = useRentalFormat()
  const nowKey = `${now.getFullYear()}-${now.getMonth() + 1}`
  const shown = periods.slice(-FRISE_MONTHS)
  if (!shown.length) return <p className="text-sm text-gray-500">{t('rental.lease.rentPeriods.empty.description')}</p>
  return (
    <>
      <div role="list" aria-label={t('rental.overview.lease.scheduleTitle')}
        className="mb-1.5 grid grid-cols-4 gap-1.5 md:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ '--n': shown.length }}>
        {shown.map((p) => {
          const s = periodState(p, now)
          const status = s === 'upcoming'
            ? t('rental.overview.lease.dueOn', { day: new Date(p.due_date).getDate() })
            : s === 'late' ? t('rental.overview.lease.unpaidSince', { count: dayDiff(p.due_date, now) })
              : s === 'partial' ? t('rental.overview.lease.restAmount', { amount: f.n(p.total_amount - (p.paid_amount || 0)) })
                : t('rental.overview.lease.paidOn', { date: f.date(p.paid_at, { day: 'numeric', month: 'short' }) })
          return (
            <div key={p.id} role="listitem" aria-label={`${f.month(p.year, p.month)} : ${t(`rental.overview.state.${s}`)}, ${f.dh(p.total_amount)}`}
              className={`grid min-w-0 gap-0.5 rounded-lg border px-2 py-2 ${FRISE_STYLE[s]} ${`${p.year}-${p.month}` === nowKey ? 'ring-[1.5px] ring-inset ring-gray-900' : ''}`}>
              <span className="text-[11.5px] font-semibold capitalize">{f.month(p.year, p.month, { month: 'short' })}</span>
              <span className="whitespace-nowrap font-display text-[13px] font-extrabold tabular-nums md:text-sm">{f.n(p.total_amount)}</span>
              <span className="truncate text-[11.5px]">{status}</span>
            </div>
          )
        })}
      </div>
      <div className="mb-4">
        <Legend items={['paid', 'paid_late', 'partial', 'late', 'upcoming'].map((s) => ({ color: { paid: '#1E7F4E', paid_late: '#F2C999', partial: '#B45309', late: '#B42318', upcoming: '#E7E3DC' }[s], label: t(`rental.overview.legend.${s}`) }))} />
      </div>
    </>
  )
}

/**
 * Contenu d'un bail : échéancier (frise + tableau, paiement et quittance), conditions, constats,
 * états des lieux et actions. Partagé par la fiche du bail et la ligne dépliée du registre.
 */
export default function LeasePanel({ lease: l, now = new Date() }) {
  const { t } = useTranslation(['backoffice', 'common'])
  const f = useRentalFormat()
  const navigate = useNavigate()
  const refresh = useRentalRefresh()
  const id = l.id
  const { data: rpData } = useQuery(['rental-rent-periods', String(id)], () => rentalService.listRentPeriods(id))
  const { data: invData } = useQuery(['rental-inventories', String(id)], () => rentalService.listInventories(id))
  const [payFor, setPayFor] = useState(null)
  const [reviseOpen, setReviseOpen] = useState(false)
  const [newRent, setNewRent] = useState('')
  const fail = (e) => toast.error(e.response?.data?.error || t('common:errors.short'))

  const sign = useMutation(() => rentalService.signLease(id), { onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.signed')); refresh() }, onError: fail })
  const revise = useMutation(() => rentalService.reviseLease(id, { new_rent: Number(newRent) }), { onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.revised')); setReviseOpen(false); refresh() }, onError: fail })
  const returnDep = useMutation(() => rentalService.returnDeposit(id, {}), { onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.depositReturned')); refresh() }, onError: fail })
  const createInv = useMutation((type) => rentalService.createInventory(id, type), {
    onSuccess: (created) => { toast.success(t('backoffice:rental.lease.toasts.inventoryCreated')); refresh(); navigate(`/backoffice/gestion-locative/etats-des-lieux/${created.id}`) },
    onError: fail,
  })

  const periods = [...(rpData?.rent_periods || [])].sort((a, b) => a.year - b.year || a.month - b.month)
  const inventories = invData?.inventories || []
  const invOf = (type) => inventories.find((i) => i.type === type)
  const findings = leaseFindings({ ...l, inventories: { entree: invOf('entree') || null } }, periods, now)
  const toEnd = l.end_date ? dayDiff(now, l.end_date) : null

  const main = (
    <>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2.5">
        <H3>{t('backoffice:rental.overview.lease.scheduleTitle')}</H3>
        <span className="text-xs text-gray-500">{t('backoffice:rental.overview.lease.scheduleNote', { day: l.payment_day || 1 })}</span>
      </div>
      <Frise periods={periods} now={now} />
      {periods.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={TH}>{t('backoffice:rental.overview.lease.columns.month')}</th>
              <th className={`${TH} text-end`}>{t('backoffice:rental.overview.lease.columns.called')}</th>
              <th className={`${TH} text-end`}>{t('backoffice:rental.overview.lease.columns.received')}</th>
              <th className={TH}>{t('backoffice:rental.lease.rentPeriods.columns.status')}</th>
              <th className={`${TH} text-end`}><span className="sr-only">{t('backoffice:rental.overview.actions')}</span></th>
            </tr></thead>
            <tbody>
              {[...periods].reverse().map((p) => {
                const s = periodState(p, now)
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className={`${TD} capitalize`}>{f.month(p.year, p.month)}</td>
                    <td className={`${TD} text-end tabular-nums`}>{f.n(p.total_amount)}</td>
                    <td className={`${TD} text-end tabular-nums`}>{p.paid_amount != null ? f.n(p.paid_amount) : '—'}</td>
                    <td className={TD}><Chip tone={STATE_TONE[s]}>{t(`backoffice:rental.overview.state.${s}`)}</Chip></td>
                    <td className={`${TD} text-end`}>
                      {p.status === 'paid'
                        ? <IconAction icon={FiDownload} label={t('backoffice:rental.lease.rentPeriods.receiptButton')} onClick={() => openPdf(rentalService.receiptPdfUrl(p.id), t)} tone="gold" tipAlign="end" />
                        : <IconAction icon={FiDollarSign} label={t('backoffice:rental.overview.lease.recordPayment')} tone="gold" tipAlign="end"
                          onClick={() => setPayFor({ ...p, rest: (p.total_amount || 0) - (p.paid_amount || 0) })} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )

  const aside = (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Kv label={t('backoffice:rental.lease.detail.fields.rent')} value={f.n(l.rent_amount)} unit={t('backoffice:dashboard.units.perMonth')} />
        <Kv label={t('backoffice:rental.lease.detail.fields.charges')} value={f.n(l.charges_amount)} unit={t('backoffice:dashboard.units.perMonth')} />
        <Kv label={t('backoffice:rental.overview.lease.deposit')} value={f.n(l.deposit_amount)} unit={t('backoffice:dashboard.units.dirham')} />
        <div className="grid gap-0.5">
          <span className="text-xs text-gray-500">{t('backoffice:rental.overview.lease.period')}</span>
          <span className="text-[13px] font-semibold">
            {l.start_date || l.end_date
              ? t('backoffice:rental.overview.lease.fromTo', { from: f.date(l.start_date), to: l.end_date ? f.date(l.end_date) : t('backoffice:rental.overview.lease.noEnd') })
              : t('backoffice:rental.overview.lease.noDates')}
          </span>
        </div>
      </div>
      {findings.map((x) => (
        <Alert key={x.key} tone={x.tone} icon={FINDING_ICON[x.key]}>
          <Rich i18nKey={`rental.overview.lease.findings.${x.key}`} values={{
            amount: f.dh(x.owed), count: x.key === 'owed' ? x.months : x.count, paid: x.paid, avg: x.avg,
            deposit: f.dh(x.deposit), days: x.days, date: f.date(x.date, { day: 'numeric', month: 'long' }),
          }} />
        </Alert>
      ))}
      <H3>{t('backoffice:rental.lease.inventories.panelTitle')}</H3>
      <div className="grid gap-2">
        {['entree', 'sortie'].map((type) => {
          const inv = invOf(type)
          return (
            <div key={type} className="flex items-center justify-between gap-2.5 text-[13px]">
              <span>{t(`backoffice:rental.overview.inventoryType.${type}`)}</span>
              <span className="flex items-center gap-1.5">
                {inv
                  ? <>
                    <Chip tone={INVENTORY_TONE[inv.status] || 'neutral'}>{t(`backoffice:rental.inventory.status.${inv.status}`, { defaultValue: inv.status })}</Chip>
                    <IconAction icon={FiExternalLink} label={t('backoffice:rental.lease.inventories.openButton')} to={`/backoffice/gestion-locative/etats-des-lieux/${inv.id}`} tone="gold" tipAlign="end" />
                  </>
                  : <>
                    {type === 'entree' || (toEnd != null && toEnd <= 45)
                      ? <Chip tone="crit">{t('backoffice:rental.overview.inventoryStatus.missing')}</Chip>
                      : <span className="text-[12.5px] text-gray-500">{t('backoffice:rental.overview.lease.atEnd')}</span>}
                    <IconAction icon={FiPlus} tone="gold" tipAlign="end" disabled={createInv.isLoading} onClick={() => createInv.mutate(type)}
                      label={type === 'entree' ? t('backoffice:rental.lease.inventories.createEntryButton') : t('backoffice:rental.lease.inventories.createExitButton')} />
                  </>}
              </span>
            </div>
          )
        })}
      </div>
      <H3>{t('backoffice:rental.overview.lease.leaseTitle')}</H3>
      <p className="m-0 text-[12.5px] text-gray-500">
        {[l.mandate_reference && t('backoffice:rental.overview.lease.mandate', { reference: l.mandate_reference }),
          l.landlord_name && t('backoffice:rental.overview.lease.landlord', { name: l.landlord_name }),
          t(`backoffice:rental.lease.status.${l.status}`, { defaultValue: l.status })].filter(Boolean).join(' · ')}
      </p>
      <div className="flex flex-wrap gap-1">
        <IconAction icon={FiDownload} label={t('backoffice:rental.overview.lease.pdf')} onClick={() => openPdf(rentalService.leasePdfUrl(id), t)} className="border border-gray-200" />
        {l.status === 'draft' && <IconAction icon={FiCheckCircle} label={t('backoffice:rental.lease.detail.signButton')} tone="primary" disabled={sign.isLoading} onClick={() => sign.mutate()} />}
        {l.status === 'active' && <IconAction icon={FiTrendingUp} label={t('backoffice:rental.lease.detail.reviseButton')} onClick={() => { setNewRent(String(l.rent_amount)); setReviseOpen(true) }} className="border border-gray-200" />}
        <IconAction icon={FiEdit3} label={t('backoffice:rental.lease.inventories.outStatementLink')} to={`/backoffice/gestion-locative/decompte/${id}`} className="border border-gray-200" />
        {l.status === 'active' && <IconAction icon={FiRotateCcw} label={t('backoffice:rental.lease.detail.returnDepositButton')} disabled={returnDep.isLoading} onClick={() => returnDep.mutate()} className="border border-gray-200" tipAlign="end" />}
      </div>
    </>
  )

  return (
    <>
      <DetailColumns main={main} aside={aside} />
      {payFor && <PayModal period={payFor} onClose={() => setPayFor(null)} />}
      <Modal open={reviseOpen} onClose={() => setReviseOpen(false)} title={t('backoffice:rental.lease.reviseModal.title')}
        footer={<>
          <button onClick={() => setReviseOpen(false)} className={SECONDARY_BTN}>{t('backoffice:rental.lease.reviseModal.cancel')}</button>
          <button disabled={!newRent || revise.isLoading} onClick={() => revise.mutate()} className={PRIMARY_BTN}>{t('backoffice:rental.lease.reviseModal.apply')}</button>
        </>}>
        <Field label={t('backoffice:rental.lease.reviseModal.newRentLabel')} type="number" value={newRent} onChange={(e) => setNewRent(e.target.value)} />
      </Modal>
    </>
  )
}
