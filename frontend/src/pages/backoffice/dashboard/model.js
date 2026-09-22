/**
 * Calculs du tableau de bord du back-office, à partir de `GET /backoffice/dashboard`.
 * Fonctions pures : le rendu n'a plus qu'à afficher, et les règles se testent sans DOM.
 */

// Ordre fixe des sources de lead : il porte aussi l'ordre des couleurs catégorielles, validé
// pour la séparation en vision des couleurs (cf. palette des graphes).
export const SOURCES = ['phone_reveal', 'callback_request', 'contact_form', 'website']
export const SOURCE_COLORS = {
  phone_reveal: '#009683', callback_request: '#3366CC', contact_form: '#B8842A', website: '#C04A86',
}

const DAY = 86400000
export const daysSince = (iso, now) => Math.floor((now - new Date(iso)) / DAY)

// Au-delà de deux semaines, un acheteur a généralement trouvé ailleurs : c'est le seuil du rouge.
export const agingTone = (days) => (days > 14 ? 'crit' : days >= 3 ? 'warn' : 'good')

export function agingBuckets(leads, now) {
  const out = { fresh: 0, recent: 0, stale: 0 }
  for (const l of leads) {
    const d = daysSince(l.created_at, now)
    out[d > 14 ? 'stale' : d >= 3 ? 'recent' : 'fresh'] += 1
  }
  return out
}

/** Contacts qui ont écrit plusieurs fois sans réponse : un seul appel traite tout. */
export function repeatedContacts(leads) {
  const counts = new Map()
  for (const l of leads) if (l.name) counts.set(l.name, (counts.get(l.name) || 0) + 1)
  return [...counts].filter(([, n]) => n > 1).map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Les 7 jours de la semaine en cours (lundi → dimanche), avec le nombre de visites. */
export function weekDays(visits, now) {
  const today = startOfDay(now)
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const key = date.toDateString()
    return {
      date,
      isToday: key === today.toDateString(),
      count: visits.filter((v) => startOfDay(new Date(v.scheduled_at)).toDateString() === key).length,
    }
  })
}

/** Écart en jours calendaires (0 = aujourd'hui, 1 = demain). */
export const dayOffset = (iso, now) => Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / DAY)

export function stageTotals(rows = []) {
  return rows.reduce((t, r) => ({
    count: t.count + r.count, amount: t.amount + r.amount, weighted: t.weighted + r.weighted,
  }), { count: 0, amount: 0, weighted: 0 })
}

export const WEEKS_FOR = { 7: 1, 30: 4, 90: 13 }

/** Semaines de la période et, à durée égale, celles de la période précédente. */
export function periodWeeks(weekly = [], period) {
  const n = WEEKS_FOR[period] || 4
  return { current: weekly.slice(-n), previous: weekly.length >= 2 * n ? weekly.slice(-2 * n, -n) : null }
}

/**
 * Entonnoir CUMULATIF : le statut d'un lead est son état actuel, donc un lead converti a
 * forcément été contacté puis qualifié. Compter les statuts bruts inverserait l'entonnoir
 * (plus de convertis que de qualifiés).
 */
export function funnelOf(weeks = []) {
  const s = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 }
  for (const w of weeks) for (const k of Object.keys(s)) s[k] += w.by_status?.[k] || 0
  return {
    received: s.new + s.contacted + s.qualified + s.converted + s.lost,
    contacted: s.contacted + s.qualified + s.converted,
    qualified: s.qualified + s.converted,
    converted: s.converted,
    lost: s.lost,
  }
}

export const sumSources = (week) => SOURCES.reduce((n, k) => n + (week.by_source?.[k] || 0), 0)

const sameMonth = (d, ref) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()

/** Affaires signées et perdues du mois en cours, et ventes signées du mois précédent. */
export function monthResults(closed = [], now) {
  const prevRef = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const acc = () => ({ count: 0, amount: 0 })
  const out = { wonSale: acc(), wonRent: acc(), lostSale: acc(), prevWonSale: acc(), won: 0, lost: 0 }
  for (const c of closed) {
    const d = new Date(c.date)
    if (sameMonth(d, now)) {
      if (c.status === 'won') out.won += 1
      else out.lost += 1
      const bucket = c.status === 'won' ? (c.type === 'rent' ? out.wonRent : out.wonSale)
        : c.type === 'sale' ? out.lostSale : null
      if (bucket) { bucket.count += 1; bucket.amount += c.amount }
    } else if (sameMonth(d, prevRef) && c.status === 'won' && c.type === 'sale') {
      out.prevWonSale.count += 1
      out.prevWonSale.amount += c.amount
    }
  }
  return out
}

export const contactRate = (l) => (l.views ? l.contacts / l.views : 0)

export function listingInsights(active = []) {
  const zero = active.filter((l) => !l.contacts)
  return {
    sale: active.filter((l) => l.transaction_type === 'sale').length,
    rent: active.filter((l) => l.transaction_type === 'rent').length,
    // La plus chère d'abord : c'est celle dont le silence coûte le plus.
    zero: [...zero].sort((a, b) => (b.price || 0) - (a.price || 0)),
    zeroViews: zero.reduce((n, l) => n + l.views, 0),
    ranked: [...active].sort((a, b) => contactRate(b) - contactRate(a) || b.views - a.views),
  }
}

export function portfolioBuckets(byStatus = {}) {
  const active = byStatus.active || 0
  const pending = byStatus.pending || 0
  const draft = byStatus.draft || 0
  const closed = (byStatus.rented || 0) + (byStatus.sold || 0)
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
  return { active, pending, draft, closed, total, rented: byStatus.rented || 0, sold: byStatus.sold || 0 }
}
