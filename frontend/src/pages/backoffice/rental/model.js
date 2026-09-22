/**
 * Règles de la page Gestion locative, à partir de `GET /backoffice/gestion-locative/summary` et des
 * listes enrichies. Fonctions pures : le rendu n'a plus qu'à afficher.
 */

const DAY = 86400000
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const dayDiff = (from, to) => Math.round((startOfDay(new Date(to)) - startOfDay(new Date(from))) / DAY)

// Au-delà de 5 jours, un loyer payé l'est « en retard » (même seuil que le service rental).
export const LATE_PAYMENT_DAYS = 5

/** État lisible d'une échéance : paid | paid_late | partial | late | upcoming. */
export function periodState(p, now) {
  if (p.status === 'paid') {
    return p.paid_at && p.due_date && dayDiff(p.due_date, p.paid_at) > LATE_PAYMENT_DAYS ? 'paid_late' : 'paid'
  }
  const overdue = p.due_date && dayDiff(p.due_date, now) > 0
  if (!overdue) return 'upcoming'
  return p.status === 'partial' ? 'partial' : 'late'
}

export const STATE_TONE = { paid: 'good', paid_late: 'good', partial: 'warn', late: 'crit', upcoming: 'neutral' }
export const STATE_COLOR = { paid: '#1E7F4E', paid_late: '#E3A857', partial: '#B45309', late: '#B42318', upcoming: '#D9D5CD' }

/** Ancienneté d'un impayé ou d'une attente : vert, orange, rouge. */
export const ageTone = (days, lo = 15, hi = 45) => (days > hi ? 'crit' : days >= lo ? 'warn' : 'good')
export const dueTone = (days) => (days <= 7 ? 'crit' : days <= 30 ? 'warn' : 'neutral')

export const APP_TONE = { received: 'neutral', reviewing: 'warn', shortlist: 'good', accepted: 'good', rejected: 'crit', withdrawn: 'neutral' }
export const MANDATE_TONE = { active: 'good', draft: 'neutral', expired: 'warn', terminated: 'crit' }
export const LEASE_TONE = { active: 'good', draft: 'neutral', ended: 'warn', terminated: 'crit' }
export const INVENTORY_TONE = { signed: 'good', finalized: 'warn', draft: 'warn', missing: 'crit', to_plan: 'warn' }

/** « a•••••@gmail.com » : assez pour reconnaître, pas pour recopier. */
export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || ''
  const [user, domain] = email.split('@')
  return `${user[0] || ''}•••••@${domain}`
}

/** « +2126••••••18 » : l'indicatif et les deux derniers chiffres. */
export function maskPhone(phone) {
  const d = (phone || '').replace(/[\s.-]/g, '')
  if (d.length < 7) return d ? '•••' : ''
  return `${d.slice(0, 5)}${'•'.repeat(d.length - 7)}${d.slice(-2)}`
}

export const matches = (q, ...fields) => {
  const s = q.trim().toLowerCase()
  return !s || fields.some((f) => f != null && String(f).toLowerCase().includes(s))
}

export const ratio = (a, b) => (b ? a / b : null)

/** Impayés regroupés par bail, du plus gros montant dû au plus petit. */
export function arrearsByLease(items = []) {
  const m = new Map()
  for (const i of items) {
    const g = m.get(i.lease_id) || { ...i, owed: 0, count: 0, age: 0 }
    g.owed += i.rest
    g.count += 1
    g.age = Math.max(g.age, i.age_days)
    m.set(i.lease_id, g)
  }
  return [...m.values()].sort((a, b) => b.owed - a.owed)
}

/** Candidatures regroupées par bien, les biens les plus demandés d'abord. */
export function groupByProperty(apps) {
  const m = new Map()
  for (const a of apps) {
    if (!m.has(a.property_id)) m.set(a.property_id, { property_id: a.property_id, title: a.property_title, city: a.property_city, apps: [] })
    m.get(a.property_id).apps.push(a)
  }
  return [...m.values()].sort((x, y) => y.apps.length - x.apps.length)
}

/** Constats d'un bail, du plus grave au moins grave (clés i18n + valeurs). */
export function leaseFindings(lease, periods, now) {
  const out = []
  const states = periods.map((p) => periodState(p, now))
  const open = periods.filter((_, i) => states[i] === 'late' || states[i] === 'partial')
  if (open.length) {
    const owed = open.reduce((n, p) => n + (p.total_amount || 0) - (p.paid_amount || 0), 0)
    out.push({ key: 'owed', tone: 'crit', owed, months: open.length })
  }
  const paidLate = periods.filter((_, i) => states[i] === 'paid_late')
  const paid = states.filter((s) => s === 'paid' || s === 'paid_late').length
  if (paidLate.length >= 3) {
    const avg = Math.round(paidLate.reduce((n, p) => n + dayDiff(p.due_date, p.paid_at), 0) / paidLate.length)
    out.push({ key: 'paysLate', tone: 'warn', count: paidLate.length, paid, avg })
  }
  if (lease.status === 'active' && lease.inventories && lease.inventories.entree?.status !== 'signed') {
    out.push({ key: lease.inventories.entree ? 'entryUnsigned' : 'entryMissing', tone: 'crit', deposit: lease.deposit_amount || 0 })
  }
  if (lease.status === 'active' && lease.end_date) {
    const left = dayDiff(now, lease.end_date)
    if (left >= 0 && left <= 45) out.push({ key: 'ending', tone: 'warn', days: left, date: lease.end_date })
  }
  return out
}

/** Hauteur de l'axe du graphe des encaissements : un palier rond au-dessus du plus haut mois. */
export function chartTop(values) {
  const max = Math.max(0, ...values)
  if (!max) return { top: 1000, step: 250 }
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw)
  return { top: Math.ceil(max / step) * step, step }
}
