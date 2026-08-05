import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiPlus, FiTrash2, FiDownload, FiLock, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, Field, EmptyState, GatedNotice, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'
import SignaturePanel from '../../../components/backoffice/SignaturePanel'
import DirIcon from '../../../components/common/DirIcon'
import useAuthStore from '../../../store/authStore'

const COND_TONE = { bon: 'bg-emerald-50 text-emerald-700', moyen: 'bg-amber-100 text-amber-700', mauvais: 'bg-red-100 text-red-700' }
const money = (v) => `${Number(v || 0).toLocaleString('fr-FR')} Đh`

function SettlementEditor() {
  const { t } = useTranslation(['backoffice', 'common'])
  const { leaseId } = useParams()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const managerName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email
  const managerEmail = user?.email
  const { data: s, isLoading, error } = useQuery(['settlement', leaseId], () => rentalService.getSettlement(leaseId), { retry: false })
  const { data: cmp } = useQuery(['inv-compare', leaseId], () => rentalService.compareInventories(leaseId), { retry: false })
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [itemId, setItemId] = useState('')
  const refresh = () => qc.invalidateQueries(['settlement', leaseId])
  const notFound = error?.response?.status === 404

  async function openPdf(url) {
    try { const r = await api.get(url, { responseType: 'blob' }); const u = URL.createObjectURL(r.data); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000) }
    catch { toast.error(t('backoffice:signature.pdfUnavailable')) }
  }

  const create = useMutation(() => rentalService.createSettlement(leaseId), { onSuccess: () => { toast.success(t('backoffice:rental.settlement.toasts.created')); refresh() }, onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')) })
  const addLine = useMutation(() => rentalService.addDeductionLine(s.id, { label, amount: Number(amount), item_id: itemId ? Number(itemId) : null }), { onSuccess: () => { toast.success(t('backoffice:rental.settlement.toasts.lineAdded')); setLabel(''); setAmount(''); setItemId(''); refresh() }, onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')) })
  const delLine = useMutation((lineId) => rentalService.deleteDeductionLine(lineId), { onSuccess: refresh, onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')) })
  const finalize = useMutation(() => rentalService.finalizeSettlement(s.id), { onSuccess: () => { toast.success(t('backoffice:rental.settlement.toasts.finalized')); refresh() }, onError: (e) => toast.error(e.response?.data?.error || t('common:errors.short')) })

  if (error?.response?.status === 403) return <GatedNotice icon={FiLock} title={t('backoffice:rental.settlement.pageTitle')} message={t('backoffice:rental.mandate.gated.message')} />
  if (isLoading) return <div className="p-6 text-gray-500">{t('backoffice:rental.shared.loading')}</div>

  const degraded = []
  ;(cmp?.rooms || []).forEach((r) => r.items.forEach((it) => { if (it.degraded && it.sortie_item_id) degraded.push({ ...it, room: r.name }) }))
  const ro = s && s.status === 'finalized'

  return (
    <div className="space-y-6">
      <Link to={`/backoffice/gestion-locative/baux/${leaseId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><DirIcon icon={FiArrowLeft} className="w-4 h-4" /> {t('backoffice:rental.inventory.backToLease')}</Link>

      {cmp && (
        <Panel title={t('backoffice:rental.settlement.comparisonTitle')}>
          {!cmp.has_sortie ? <EmptyState title={t('backoffice:rental.settlement.noExit.title')} description={t('backoffice:rental.settlement.noExit.description')} /> : (
            <div className="space-y-4">
              {cmp.rooms.map((r) => (
                <div key={r.name}>
                  <h4 className="font-medium text-gray-900 mb-1">{r.name}</h4>
                  <div className="space-y-1">
                    {r.items.map((it) => (
                      <div key={it.label} className={`flex flex-wrap items-center gap-2 text-sm px-2 py-1 rounded-lg ${it.degraded ? 'bg-red-50' : ''}`}>
                        <span className="w-40 text-gray-700">{it.label}</span>
                        <StatusBadge label={t(`backoffice:rental.inventory.condition.${it.entree}`, { defaultValue: it.entree || '—' })} className={COND_TONE[it.entree] || 'bg-gray-100 text-gray-500'} />
                        <span className="text-gray-400">→</span>
                        <StatusBadge label={t(`backoffice:rental.inventory.condition.${it.sortie}`, { defaultValue: it.sortie || '—' })} className={COND_TONE[it.sortie] || 'bg-gray-100 text-gray-500'} />
                        {it.degraded && <span className="inline-flex items-center gap-1 text-red-600 text-xs"><FiAlertTriangle className="w-3.5 h-3.5" /> {t('backoffice:rental.settlement.degradedLabel')}</span>}
                        {it.sortie_comment && <span className="text-gray-500 text-xs">— {it.sortie_comment}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel title={t('backoffice:rental.settlement.pageTitle')}
        action={s && <div className="flex items-center gap-2">
          <StatusBadge label={ro ? t('backoffice:rental.inventory.status.finalized') : t('backoffice:rental.inventory.status.draft')} className={ro ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-700'} />
          <button onClick={() => openPdf(rentalService.settlementPdfUrl(s.id))} className={SECONDARY_BTN}><FiDownload className="w-4 h-4" /> {t('backoffice:rental.inventory.pdfButton')}</button>
          {!ro && <button disabled={finalize.isLoading} onClick={() => finalize.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> {t('backoffice:rental.inventory.finalizeButton')}</button>}
        </div>}>
        {notFound || !s ? (
          <EmptyState title={t('backoffice:rental.settlement.empty.title')} description={t('backoffice:rental.settlement.empty.description')}
            action={<button onClick={() => create.mutate()} className={PRIMARY_BTN}><FiPlus className="w-5 h-5" /> {t('backoffice:rental.settlement.createButton')}</button>} />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              {s.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-sm border-b border-gray-100 py-1">
                  <span className="text-gray-700">{l.label}</span>
                  <span className="flex items-center gap-3"><span className="text-gray-900 font-medium">{money(l.amount)}</span>
                    {!ro && <button onClick={() => delLine.mutate(l.id)} className="text-gray-300 hover:text-red-600"><FiTrash2 className="w-4 h-4" /></button>}</span>
                </div>
              ))}
              {s.lines.length === 0 && <p className="text-sm text-gray-400">{t('backoffice:rental.settlement.noLines')}</p>}
            </div>

            {!ro && (
              <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                <div className="flex-1 min-w-[160px]"><Field label={t('backoffice:rental.settlement.form.labelLabel')} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('backoffice:rental.settlement.form.labelPlaceholder')} /></div>
                <div className="w-32"><Field label={t('backoffice:rental.settlement.form.amountLabel')} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="px-2 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="">{t('backoffice:rental.settlement.form.itemPlaceholder')}</option>
                  {degraded.map((d) => <option key={d.sortie_item_id} value={d.sortie_item_id}>{d.room} — {d.label}</option>)}
                </select>
                <button disabled={!label || !amount || addLine.isLoading} onClick={() => addLine.mutate()} className={SECONDARY_BTN}><FiPlus className="w-4 h-4" /> {t('backoffice:rental.settlement.form.addButton')}</button>
              </div>
            )}

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-gray-100 pt-3 text-sm">
              <div><dt className="text-gray-500">{t('backoffice:rental.settlement.totals.deposit')}</dt><dd className="mt-1 text-gray-900 font-medium">{money(s.deposit_amount)}</dd></div>
              <div><dt className="text-gray-500">{t('backoffice:rental.settlement.totals.totalDeductions')}</dt><dd className="mt-1 text-gray-900 font-medium">{money(s.total_deductions)}</dd></div>
              <div><dt className="text-gray-500">{t('backoffice:rental.settlement.totals.refunded')}</dt><dd className="mt-1 text-emerald-700 font-semibold">{money(s.refunded_amount)}</dd></div>
              <div><dt className="text-gray-500">{t('backoffice:rental.settlement.totals.balanceDue')}</dt><dd className={`mt-1 font-semibold ${Number(s.balance_due) > 0 ? 'text-red-600' : 'text-gray-400'}`}>{money(s.balance_due)}</dd></div>
            </dl>
            {Number(s.balance_due) > 0 && <p className="text-sm text-red-600 inline-flex items-center gap-1"><FiAlertTriangle className="w-4 h-4" /> {t('backoffice:rental.settlement.balanceWarning')}</p>}
          </div>
        )}
      </Panel>
      {ro && <SignaturePanel docType="settlement" docId={s.id} managerName={managerName} managerEmail={managerEmail} />}
    </div>
  )
}
export default SettlementEditor
