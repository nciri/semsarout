import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiArrowLeft, FiCheckCircle, FiDownload } from 'react-icons/fi'
import api from '../../../services/api'
import { rentalService } from '../../../services/rentalService'
import { Panel, StatusBadge, DataTable, EmptyState, PRIMARY_BTN, SECONDARY_BTN } from '../../../components/backoffice/ui'

const STATUS = {
  draft: ['Brouillon', 'bg-gray-100 text-gray-700'],
  active: ['Actif', 'bg-emerald-50 text-emerald-700'],
  expired: ['Échu', 'bg-amber-100 text-amber-700'],
  terminated: ['Résilié', 'bg-red-100 text-red-700'],
}

async function openPdf(url) {
  try {
    const res = await api.get(url, { responseType: 'blob' })
    window.open(URL.createObjectURL(res.data), '_blank')
  } catch { toast.error('PDF indisponible') }
}

function MandateDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data: m, isLoading } = useQuery(['rental-mandate', id], () => rentalService.getMandate(id))
  const { data: crgData } = useQuery(['rental-crg', id], () => rentalService.listCrg(id))
  const sign = useMutation(() => rentalService.signMandate(id), {
    onSuccess: () => { toast.success('Mandat signé'); qc.invalidateQueries(['rental-mandate', id]) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  if (isLoading || !m) return <div className="p-6 text-gray-500">Chargement…</div>

  const crg = crgData?.reports || []
  const crgColumns = [
    { header: 'Période', cell: (c) => <span className="text-gray-700">{c.period_label}</span> },
    { header: 'Encaissé', align: 'right', cell: (c) => <span className="text-gray-700">{c.rent_collected} Đh</span> },
    { header: 'Net reversé', align: 'right', cell: (c) => <span className="font-medium text-gray-900">{c.net} Đh</span> },
    { header: '', align: 'right', cell: (c) => <button onClick={() => openPdf(rentalService.crgPdfUrl(id, c.id))} className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"><FiDownload className="w-4 h-4" /> PDF</button> },
  ]

  return (
    <div className="space-y-6">
      <Link to="/backoffice/gestion-locative" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><FiArrowLeft className="w-4 h-4" /> Retour aux mandats</Link>
      <Panel title={`Mandat ${m.reference}`} action={m.status === 'draft' && <button disabled={sign.isLoading} onClick={() => sign.mutate()} className={PRIMARY_BTN}><FiCheckCircle className="w-5 h-5" /> Signer</button>}>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-gray-500">Statut</dt><dd className="mt-1"><StatusBadge label={STATUS[m.status]?.[0] || m.status} className={STATUS[m.status]?.[1]} /></dd></div>
          <div><dt className="text-gray-500">Type</dt><dd className="mt-1 text-gray-900">{m.mandate_type === 'gestion' ? 'Gestion' : 'Location'}</dd></div>
          <div><dt className="text-gray-500">Honoraires</dt><dd className="mt-1 text-gray-900">{m.fee_percent != null ? `${m.fee_percent} %` : '—'}</dd></div>
          <div><dt className="text-gray-500">Bien (ID)</dt><dd className="mt-1 text-gray-900">{m.property_id}</dd></div>
          <div><dt className="text-gray-500">Bailleur (client)</dt><dd className="mt-1 text-gray-900">{m.landlord_client_id}</dd></div>
        </dl>
      </Panel>
      <Panel title="Comptes-rendus de gestion (CRG)">
        <DataTable columns={crgColumns} rows={crg}
          empty={<EmptyState title="Aucun CRG" description="Les comptes-rendus mensuels apparaissent ici une fois les loyers encaissés." />} />
      </Panel>
    </div>
  )
}
export default MandateDetail
