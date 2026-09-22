/**
 * Règles du registre des transactions (`GET /backoffice/transactions` et `/summary`).
 * Fonctions pures : le rendu n'a plus qu'à afficher.
 */

export const TYPES = ['sale', 'rent']
export const STATUSES = ['active', 'won', 'lost', 'on_hold']

// Ordre du service (SALE_STAGES / RENT_STAGES) : contact et visite sont communs.
export const STAGES = {
  sale: ['contact', 'visit', 'offer', 'negotiation', 'compromise', 'final_act'],
  rent: ['contact', 'visit', 'application', 'verification', 'lease', 'move_in'],
}

export const stagesFor = (type) => (STAGES[type] || [...new Set([...STAGES.sale, ...STAGES.rent])])

export const PERIODS = ['30', '90', '365', 'all']
export const DEFAULT_PERIOD = '90'

/** Début de la période (date locale AAAA-MM-JJ), ou '' pour « tout ». */
export function sinceFor(period, now) {
  const days = Number(period)
  if (!days) return ''
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Paramètres de requête sans les filtres vides. */
export function queryParams(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null))
}

/** Changer de type invalide une étape propre à l'autre type. */
export function withType(filters, type) {
  const stage = filters.stage && stagesFor(type).includes(filters.stage) ? filters.stage : ''
  return { ...filters, type, stage, page: 1 }
}

/** Meilleur prix connu : même règle que le service (final, puis offre, puis demandé). */
export const dealValue = (tx) => tx.final_price ?? tx.offer_price ?? tx.asking_price ?? 0

export const statusTone = (s) => ({ active: 'gold', won: 'good', lost: 'crit' }[s] || 'neutral')

export const probabilityTone = (p) => (p >= 70 ? 'good' : p >= 40 ? 'warn' : 'crit')

const STAGE_DATES = [
  ['contact_date', 'contact'], ['visit_date', 'visit'], ['offer_date', 'offer'],
  ['acceptance_date', 'acceptance'], ['compromise_date', 'compromise'], ['closing_date', 'closing'],
]

/** Jalons datés, dans l'ordre du parcours ; la clôture prévue n'apparaît que tant que l'affaire est ouverte. */
export function milestones(tx) {
  const out = STAGE_DATES.filter(([f]) => tx[f]).map(([f, key]) => ({ key, date: tx[f] }))
  if (tx.closed_at) out.push({ key: tx.status === 'lost' ? 'lostOn' : 'closedOn', date: tx.closed_at })
  else if (tx.expected_closing_date) out.push({ key: 'expected', date: tx.expected_closing_date, planned: true })
  return out
}

/** Clôture prévue dépassée sur une affaire encore ouverte. */
export const isOverdue = (tx, now) => !tx.closed_at && tx.status === 'active'
  && !!tx.expected_closing_date && new Date(tx.expected_closing_date) < now
