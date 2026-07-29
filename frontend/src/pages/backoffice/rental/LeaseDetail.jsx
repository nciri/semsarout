import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiCheckCircle, FiDownload } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, DataTable, EmptyState, Modal, Field, PRIMARY_BTN, SECONDARY_BTN, Select } from '../../../components/backoffice/ui'

async function openPdf(url) {
  try { const res = await api.get(url, { responseType: 'blob' }); window.open(URL.createObjectURL(res.data), '_blank') }
  catch { toast.error('PDF indisponible') }
}

const RP_STATUS = {
  pending: ['À régler', 'bg-gray-100 text-gray-700'],
  late: ['En retard', 'bg-red-100 text-red-700'],
  partial: ['Partiel', 'bg-amber-100 text-amber-700'],
  paid: ['Payé', 'bg-emerald-50 text-emerald-700'],
}

function LeaseDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: l, isLoading } = useQuery(['rental-lease', id], () => rentalService.getLease(id))
  const { data: rpData } = useQuery(['rental-rent-periods', id], () => rentalService.listRentPeriods(id))
  const [payFor, setPayFor] = useState(null)   // rent period being paid
  const [payForm, setPayForm] = useState({ amount: '', method: 'virement' })
  const [reviseOpen, setReviseOpen] = useState(false)
  const [newRent, setNewRent] = useState('')

  const refresh = () => { qc.invalidateQueries(['rental-lease', id]); qc.invalidateQueries(['rental-rent-periods', id]) }
  const sign = useMutation(() => rentalService.signLease(id), { onSuccess: () => { toast.success('Bail signé'); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const revise = useMutation(() => rentalService.reviseLease(id, { new_rent: Number(newRent) }), { onSuccess: () => { toast.success('Loyer révisé'); setReviseOpen(false); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const returnDep = useMutation(() => rentalService.returnDeposit(id, {}), { onSuccess: () => { toast.success('Dépôt restitué'); refresh() }, onError: (e) => toast.error(e.response?.data?.error || 'Erreur') })
  const pay = useMutation(() => rentalService.payRentPeriod(payFor.id, { amount: Number(payForm.amount), method: payForm.method }), {
    onSuccess: () => { toast.success('Paiement enregistré'); setPayFor(null); setPayForm({ amount: '', method: 'virement' }); refresh() },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  if (isLoading || !l) return <div className="p-6 text-gray-500">Chargement…</div>
  const periods = rpData?.rent_periods || []
  const columns = [
    { header: 'Période', cell: (p) => <span className="text-gray-700">{p.period_label}</span> },
    { header: 'Dû', align: 'right', cell: (p) => <span className="text-gray-700">{p.total_amount} Đh</span> },
    { header: 'Statut', cell: (p) => <StatusBadge label={RP_STATUS[p.status]?.[0] || p.status} className={RP_STATUS[p.status]?.[1]} /> },
    { header: '', align: 'right', cell: (p) => p.status === 'paid'
      ? <button onClick={() => openPdf(rentalService.receiptPdfUrl(p.id))} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"><FiDownload className="w-4 h-4" /> Quittance</button>
      : <button onClick={() => { setPayFor(p); setPayForm({ amount: String(p.total_amount), method: 'virement' }) }} className="text-primary-600 hover:text-primary-700 font-medium">Enregistrer paiement</button> },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative/baux" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour aux baux</Link>
      <Panel title={`Bail ${l.reference}`} action={<div className="flex gap-2">
        {l.status === 'draft' && <button disabled={sign.isLoading} onClick={() => sign.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> Signer</button>}
        {l.status === 'active' && <button onClick={() => { setNewRent(String(l.rent_amount)); setReviseOpen(true) }} className={SECONDARY_BTN}>Réviser le loyer</button>}
        {l.status === 'active' && <button disabled={returnDep.isLoading} onClick={() => returnDep.mutate()} className={SECONDARY_BTN}>Restituer le dépôt</button>}
      </div>}>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><dt className="text-gray-500">Statut</dt><dd className="mt-1"><StatusBadge label={l.status} /></dd></div>
          <div><dt className="text-gray-500">Loyer</dt><dd className="mt-1 text-gray-900">{l.rent_amount} Đh</dd></div>
          <div><dt className="text-gray-500">Charges</dt><dd className="mt-1 text-gray-900">{l.charges_amount || 0} Đh</dd></div>
          <div><dt className="text-gray-500">Dépôt</dt><dd className="mt-1 text-gray-900">{l.deposit_amount || 0} Đh</dd></div>
        </dl>
      </Panel>
      <Panel title="Quittancement">
        <DataTable columns={columns} rows={periods}
          empty={<EmptyState title="Aucune échéance" description="Les échéances de loyer sont générées mensuellement par l'ordonnanceur." />} />
      </Panel>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`Enregistrer un paiement — ${payFor?.period_label || ''}`}
        footer={<>
          <button onClick={() => setPayFor(null)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={!payForm.amount || pay.isLoading} onClick={() => pay.mutate()} className={PRIMARY_BTN}>Enregistrer</button>
        </>}>
        <Field label="Montant (Đh)" type="number" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} />
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Méthode</label>
          <Select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))} className="w-full">
            <option value="virement">Virement</option><option value="cheque">Chèque</option><option value="especes">Espèces</option><option value="carte">Carte</option>
          </Select>
        </div>
      </Modal>

      <Modal open={reviseOpen} onClose={() => setReviseOpen(false)} title="Réviser le loyer"
        footer={<>
          <button onClick={() => setReviseOpen(false)} className={SECONDARY_BTN}>Annuler</button>
          <button disabled={!newRent || revise.isLoading} onClick={() => revise.mutate()} className={PRIMARY_BTN}>Appliquer</button>
        </>}>
        <Field label="Nouveau loyer (Đh)" type="number" value={newRent} onChange={(e) => setNewRent(e.target.value)} />
      </Modal>
    </div>
  )
}
export default LeaseDetail
