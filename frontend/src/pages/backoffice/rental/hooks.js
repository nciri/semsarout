import { useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { useTranslation } from 'react-i18next'
import api from '../../../services/api'
import { useFormat } from '../../../utils/format'

/** Montants de la page : toujours des loyers, en dirhams entiers (« 9 000 Dh »). */
export function useRentalFormat() {
  const { t } = useTranslation('backoffice')
  const { fmtNumber, fmtDate } = useFormat()
  const n = (v) => fmtNumber(Math.round(v || 0))
  return {
    n,
    dh: (v) => `${n(v)} ${t('dashboard.units.dirham')}`,
    pct: (r) => (r == null ? '—' : `${fmtNumber(Math.round(r * 100))} %`),
    month: (y, m, opts = { month: 'long', year: 'numeric' }) => fmtDate(new Date(y, m - 1, 1), opts),
    date: (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => (iso ? fmtDate(iso, opts) : '—'),
  }
}

/** Rafraîchit tout ce qu'une action de gestion locative peut changer. */
export function useRentalRefresh() {
  const qc = useQueryClient()
  return () => ['rental-summary', 'rental-leases', 'rental-lease', 'rental-rent-periods', 'rental-inventories', 'rental-mandates', 'rental-applications', 'rental-application']
    .forEach((k) => qc.invalidateQueries(k))
}

export async function openPdf(url, t) {
  try { const res = await api.get(url, { responseType: 'blob' }); window.open(URL.createObjectURL(res.data), '_blank') }
  catch { toast.error(t('backoffice:signature.pdfUnavailable')) }
}
