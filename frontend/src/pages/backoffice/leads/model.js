/**
 * Règles de la page Leads, sans DOM : statut suivant, historique, synthèse des sources et de la
 * conversion à partir de `GET /backoffice/leads/stats`.
 */
import { SOURCES, funnelOf } from '../dashboard/model'

export const STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost']

// « qualified » → conversion en client (POST convert-lead), pas un simple changement de statut.
export const NEXT_STATUS = { new: 'contacted', contacted: 'qualified', qualified: 'converted' }

export const isOpen = (status) => status in NEXT_STATUS

export const STATUS_TONES = { new: 'gold', contacted: 'warn', qualified: 'good', converted: 'good', lost: 'neutral' }

/** Sources dans l'ordre (et les couleurs) du tableau de bord ; le reste est regroupé en « other ». */
export function sourceShares(bySource = []) {
  const counts = Object.fromEntries([...SOURCES, 'other'].map((s) => [s, 0]))
  for (const r of bySource) counts[SOURCES.includes(r.source) ? r.source : 'other'] += r.count
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return { total, rows: Object.entries(counts).filter(([s, n]) => n > 0 || s !== 'other').map(([source, count]) => ({ source, count })) }
}

/** Entonnoir cumulatif (un converti a été contacté puis qualifié) et taux de conversion. */
export function conversionOf(byStatus = []) {
  const f = funnelOf([{ by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.count])) }])
  return { ...f, rate: f.received ? f.converted / f.received : 0 }
}

const STEPS = [
  ['received', 'created_at'], ['contacted', 'contacted_at'], ['qualified', 'qualified_at'], ['converted', 'converted_at'],
]
const REACHED = { new: 0, contacted: 1, qualified: 2, converted: 3, lost: 0 }

/**
 * Étapes franchies par le lead. Une étape impliquée par le statut actuel mais sans horodatage
 * (données importées, statut forcé) apparaît quand même, avec `at: null`.
 */
export function statusHistory(lead) {
  const reached = REACHED[lead.status] ?? 0
  const steps = STEPS
    .filter(([, field], i) => i <= reached || lead[field])
    .map(([key, field]) => ({ key, at: lead[field] || null }))
  if (lead.status === 'lost') steps.push({ key: 'lost', at: lead.lost_at || null })
  return steps
}
