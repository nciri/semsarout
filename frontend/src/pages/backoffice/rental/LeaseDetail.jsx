import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiCheckCircle, FiDownload, FiLock, FiFileText, FiDollarSign } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, DataTable, EmptyState, Modal, Field, PRIMARY_BTN, SECONDARY_BTN, Select, GatedNotice } from '../../../components/backoffice/ui'
import SignaturePanel from '../../../components/backoffice/SignaturePanel'
import DirIcon from '../../../components/common/DirIcon'
import useAuthStore from '../../../store/authStore'

const STATUS_TONE = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-50 text-emerald-700',
  ended: 'bg-amber-100 text-amber-700',
  terminated: 'bg-red-100 text-red-700',
}

const RP_STATUS_TONE = {
  pending: 'bg-gray-100 text-gray-700',
  late: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-50 text-emerald-700',
}

function LeaseDetail() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { id } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const managerName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email
  const managerEmail = user?.email
  const { data: l, isLoading, error } = useQuery(['rental-lease', id], () => rentalService.getLease(id))
  const { data: rpData } = useQuery(['rental-rent-periods', id], () => rentalService.listRentPeriods(id))
  const { data: invData } = useQuery(['rental-inventories', id], () => rentalService.listInventories(id))
  const [payFor, setPayFor] = useState(null)   // rent period being paid
  const [payForm, setPayForm] = useState({ amount: '', method: 'virement' })
  const [reviseOpen, setReviseOpen] = useState(false)
  const [newRent, setNewRent] = useState('')

  async function openPdf(url) {
    try { const res = await api.get(url, { responseType: 'blob' }); window.open(URL.createObjectURL(res.data), '_blank') }
    catch { toast.error(t('backoffice:signature.pdfUnavailable')) }
  }

  const refresh = () => { qc.invalidateQueries(['rental-lease', id]); qc.invalidateQueries(['rental-rent-periods', id]); qc.invalidateQueries(['rental-inventories', id]) }
  const sign = useMutation(() => rentalService.signLease(id), { onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.signed')); refresh() }, onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')) })
  const revise = useMutation(() => rentalService.reviseLease(id, { new_rent: Number(newRent) }), { onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.revised')); setReviseOpen(false); refresh() }, onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')) })
  const returnDep = useMutation(() => rentalService.returnDeposit(id, {}), { onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.depositReturned')); refresh() }, onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')) })
  const pay = useMutation(() => rentalService.payRentPeriod(payFor.id, { amount: Number(payForm.amount), method: payForm.method }), {
    onSuccess: () => { toast.success(t('backoffice:rental.lease.toasts.paymentRecorded')); setPayFor(null); setPayForm({ amount: '', method: 'virement' }); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })
  const createInv = useMutation((type) => rentalService.createInventory(id, type), {
    onSuccess: (created) => { toast.success(t('backoffice:rental.lease.toasts.inventoryCreated')); refresh(); navigate(`/backoffice/gestion-locative/etats-des-lieux/${created.id}`) },
    onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')),
  })

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.shared.pageTitle')} message={t('backoffice:rental.lease.gated.message')} />
  if (isLoading) return <div className="p-6 text-gray-500">{t('backoffice:rental.shared.loading')}</div>
  if (!l) return (
    <div className="p-6">
      <Link to="/backoffice/gestion-locative/baux" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:rental.shared.back')}</Link>
      <p className="mt-4 text-gray-500">{t('backoffice:rental.shared.notFound')}</p>
    </div>
  )
  const periods = rpData?.rent_periods || []
  const columns = [
    { header: t('backoffice:rental.lease.rentPeriods.columns.period'), cell: (p) => <span className="text-gray-700">{p.period_label}</span> },
    { header: t('backoffice:rental.lease.rentPeriods.columns.due'), align: 'right', cell: (p) => <span className="text-gray-700">{p.total_amount} Đh</span> },
    { header: t('backoffice:rental.lease.rentPeriods.columns.status'), cell: (p) => <StatusBadge label={t(`backoffice:rental.lease.rentPeriods.status.${p.status}`, { defaultValue: p.status })} className={RP_STATUS_TONE[p.status]} /> },
    { header: '', align: 'right', cell: (p) => p.status === 'paid'
      ? <button onClick={() => openPdf(rentalService.receiptPdfUrl(p.id))} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"><FiDownload className="w-4 h-4" /> {t('backoffice:rental.lease.rentPeriods.receiptButton')}</button>
      : <button onClick={() => { setPayFor(p); setPayForm({ amount: String(p.total_amount), method: 'virement' }) }} className="text-primary-600 hover:text-primary-700 font-medium">{t('backoffice:rental.lease.rentPeriods.recordPaymentButton')}</button> },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative/baux" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:rental.lease.backToList')}</Link>
      <Panel title={t('backoffice:rental.lease.detail.title', { reference: l.reference })} action={<div className="flex gap-2">
        <button onClick={() => openPdf(rentalService.leasePdfUrl(id))} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> {t('backoffice:rental.lease.detail.pdfButton')}</button>
        {l.status === 'draft' && <button disabled={sign.isLoading} onClick={() => sign.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> {t('backoffice:rental.lease.detail.signButton')}</button>}
        {l.status === 'active' && <button onClick={() => { setNewRent(String(l.rent_amount)); setReviseOpen(true) }} className={SECONDARY_BTN}>{t('backoffice:rental.lease.detail.reviseButton')}</button>}
        {l.status === 'active' && <button disabled={returnDep.isLoading} onClick={() => returnDep.mutate()} className={SECONDARY_BTN}>{t('backoffice:rental.lease.detail.returnDepositButton')}</button>}
      </div>}>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><dt className="text-gray-500">{t('backoffice:rental.lease.detail.fields.status')}</dt><dd className="mt-1"><StatusBadge label={t(`backoffice:rental.lease.status.${l.status}`, { defaultValue: l.status })} className={STATUS_TONE[l.status]} /></dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.lease.detail.fields.rent')}</dt><dd className="mt-1 text-gray-900">{l.rent_amount} Đh</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.lease.detail.fields.charges')}</dt><dd className="mt-1 text-gray-900">{l.charges_amount || 0} Đh</dd></div>
          <div><dt className="text-gray-500">{t('backoffice:rental.lease.detail.fields.deposit')}</dt><dd className="mt-1 text-gray-900">{l.deposit_amount || 0} Đh</dd></div>
        </dl>
      </Panel>
      <Panel title={t('backoffice:rental.lease.rentPeriods.panelTitle')}>
        <DataTable columns={columns} rows={periods}
          empty={<EmptyState title={t('backoffice:rental.lease.rentPeriods.empty.title')} description={t('backoffice:rental.lease.rentPeriods.empty.description')} />} />
      </Panel>
      <Panel title={t('backoffice:rental.lease.inventories.panelTitle')} action={
        <Link to={`/backoffice/gestion-locative/decompte/${id}`} className={SECONDARY_BTN}><FiDollarSign className="w-4 h-4" /> {t('backoffice:rental.lease.inventories.outStatementLink')}</Link>
      }>
        <div className="space-y-3">
          {['entree', 'sortie'].map((type) => {
            const found = (invData?.inventories || []).find((i) => i.type === type)
            const label = type === 'entree' ? t('backoffice:rental.lease.inventories.entryLabel') : t('backoffice:rental.lease.inventories.exitLabel')
            return (
              <div key={type} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <FiFileText className="w-5 h-5 text-gray-300" />
                  <span className="text-gray-700">{label}</span>
                  {found && <StatusBadge label={t(`backoffice:rental.inventory.status.${found.status}`, { defaultValue: found.status })} />}
                </div>
                {found ? (
                  <Link to={`/backoffice/gestion-locative/etats-des-lieux/${found.id}`} className="text-primary-600 hover:text-primary-700 font-medium">{t('backoffice:rental.lease.inventories.openButton')}</Link>
                ) : (
                  <button disabled={createInv.isLoading} onClick={() => createInv.mutate(type)} className={SECONDARY_BTN}>
                    {type === 'entree' ? t('backoffice:rental.lease.inventories.createEntryButton') : t('backoffice:rental.lease.inventories.createExitButton')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Panel>

      <SignaturePanel docType="lease" docId={id} managerName={managerName} managerEmail={managerEmail} />

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={t('backoffice:rental.lease.payModal.title', { period: payFor?.period_label || '' })}
        footer={<>
          <button onClick={() => setPayFor(null)} className={SECONDARY_BTN}>{t('backoffice:rental.lease.payModal.cancel')}</button>
          <button disabled={!payForm.amount || pay.isLoading} onClick={() => pay.mutate()} className={PRIMARY_BTN}>{t('backoffice:rental.lease.payModal.submit')}</button>
        </>}>
        <Field label={t('backoffice:rental.lease.payModal.amountLabel')} type="number" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} />
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('backoffice:rental.lease.payModal.methodLabel')}</label>
          <Select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))} className="w-full">
            <option value="virement">{t('backoffice:rental.lease.payModal.methods.virement')}</option>
            <option value="cheque">{t('backoffice:rental.lease.payModal.methods.cheque')}</option>
            <option value="especes">{t('backoffice:rental.lease.payModal.methods.especes')}</option>
            <option value="carte">{t('backoffice:rental.lease.payModal.methods.carte')}</option>
          </Select>
        </div>
      </Modal>

      <Modal open={reviseOpen} onClose={() => setReviseOpen(false)} title={t('backoffice:rental.lease.reviseModal.title')}
        footer={<>
          <button onClick={() => setReviseOpen(false)} className={SECONDARY_BTN}>{t('backoffice:rental.lease.reviseModal.cancel')}</button>
          <button disabled={!newRent || revise.isLoading} onClick={() => revise.mutate()} className={PRIMARY_BTN}>{t('backoffice:rental.lease.reviseModal.apply')}</button>
        </>}>
        <Field label={t('backoffice:rental.lease.reviseModal.newRentLabel')} type="number" value={newRent} onChange={(e) => setNewRent(e.target.value)} />
      </Modal>
    </div>
  )
}
export default LeaseDetail
