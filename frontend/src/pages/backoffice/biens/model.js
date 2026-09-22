/**
 * Calculs de la page « Biens immobiliers », à partir de `GET /backoffice/properties/insights`
 * (portefeuille enrichi) et de `GET /backoffice/dashboard` (leads nouveaux, visites à venir).
 * Fonctions pures : le rendu n'a plus qu'à afficher, et les règles se testent sans DOM.
 */

export const STATUSES = ['active', 'pending', 'draft', 'rented', 'sold']
export const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'land', 'commercial', 'office']
export const STATUS_TONE = { active: 'good', pending: 'neutral', draft: 'neutral', rented: 'neutral', sold: 'neutral' }
export const STATUS_COLORS = { active: '#0F766E', pending: '#6BB5AC', draft: '#C3E2DD', closed: '#D9D5CD' }

// Échelle unique du graphe de prix : 0 à 200 % du prix moyen au m² du quartier. Au-delà, flèche.
export const MAX_RATIO = 2
export const PAGE_SIZE = 12
// En dessous, une fiche sans photo n'a pas non plus de quoi retenir l'acheteur.
export const SHORT_DESCRIPTION = 100
const SIGNAL_WEIGHT = { crit: 4, warn: 2, neutral: 1 }

/**
 * Prix au m² comparable au référentiel : le référentiel des locations est mensuel, un loyer
 * à la nuit ou à la semaine ne s'y compare pas.
 */
export function pricePerSqm(p) {
  if (!p.surface || p.surface <= 0 || p.price == null) return null
  if (p.transaction_type === 'rent' && p.price_period && p.price_period !== 'month') return null
  return p.price / p.surface
}

/** Position dans la fourchette du quartier : `ratio` au prix moyen, `pos` in | above | below. */
export function pricePosition(p) {
  const sqm = pricePerSqm(p)
  const ref = p.price_ref
  if (sqm == null || !ref?.avg) return null
  return { sqm, ratio: sqm / ref.avg, pos: sqm > ref.max ? 'above' : sqm < ref.min ? 'below' : 'in', ref }
}

/**
 * Ce qui freine une annonce, du plus grave au plus léger. Chaque signal : [tone, code, valeurs].
 * Le libellé est traduit au rendu (`board.signals.<code>`).
 */
export function signalsOf(p, { newLeads = 0 } = {}) {
  const s = []
  const online = p.status === 'active'
  const price = pricePosition(p)
  if (p.status_check) s.push(['crit', 'status'])
  if (p.status === 'draft') s.push(['warn', 'draft'])
  if (online && !p.images_count) s.push(['warn', 'noPhoto'])
  if (online && price?.pos === 'above') {
    s.push(['crit', price.ratio > MAX_RATIO ? 'priceTimes' : 'priceAbove', { ratio: price.ratio, pct: Math.round((price.ratio - 1) * 100) }])
  }
  if (online && price?.pos === 'below') s.push(['warn', 'priceBelow', { pct: Math.round((1 - price.ratio) * 100) }])
  if (newLeads) s.push(['warn', 'newLeads', { count: newLeads }])
  if (online && !p.surface) s.push(['neutral', 'noSurface'])
  return s
}

const countBy = (rows, key) => rows.reduce((m, r) => {
  const k = r[key]
  if (k != null) m.set(k, (m.get(k) || 0) + 1)
  return m
}, new Map())

/** Rattache à chaque bien ses leads nouveaux, ses visites à venir, ses signaux et son score. */
export function enrich(properties = [], { newLeads = [], upcomingVisits = [] } = {}) {
  const leads = countBy(newLeads, 'property_id')
  const visits = countBy(upcomingVisits, 'property_id')
  return properties.map((p) => {
    const signals = signalsOf(p, { newLeads: leads.get(p.id) || 0 })
    return {
      ...p,
      newLeads: leads.get(p.id) || 0,
      upcoming: visits.get(p.id) || 0,
      market: pricePosition(p),
      signals,
      score: signals.reduce((a, [tone]) => a + SIGNAL_WEIGHT[tone], 0),
    }
  })
}

export function statusCounts(rows) {
  const c = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const r of rows) if (r.status in c) c[r.status] += 1
  return c
}

/** Synthèse du portefeuille : ce qui est en ligne, ce que ça attire, ce qui attend l'agent. */
export function overview(rows, { newLeads = [], upcomingVisits = [] } = {}) {
  const c = statusCounts(rows)
  const online = rows.filter((r) => r.status === 'active')
  const views = online.reduce((a, r) => a + (r.views_count || 0), 0)
  const contacts = online.reduce((a, r) => a + (r.contacts_count || 0), 0)
  const last = upcomingVisits.map((v) => v.scheduled_at).sort().at(-1) || null
  return {
    total: rows.length,
    counts: c,
    buckets: { active: c.active, pending: c.pending, draft: c.draft, closed: c.rented + c.sold },
    online: { total: online.length, sale: online.filter((r) => r.transaction_type === 'sale').length,
      rent: online.filter((r) => r.transaction_type === 'rent').length, views, contacts,
      rate: views ? contacts / views : 0 },
    visits: { count: upcomingVisits.length, properties: new Set(upcomingVisits.map((v) => v.property_id)).size, last },
    leads: { count: newLeads.length, properties: new Set(newLeads.map((l) => l.property_id).filter(Boolean)).size },
  }
}

const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0)

/** Annonces en ligne sans photo, les plus vues d'abord, comparées à celles qui en ont. */
export function photoQueue(rows) {
  const online = rows.filter((r) => r.status === 'active')
  const without = online.filter((r) => !r.images_count).sort((a, b) => (b.views_count || 0) - (a.views_count || 0))
  const withP = online.filter((r) => r.images_count)
  const side = (list) => ({ count: list.length, views: sum(list, 'views_count'), contacts: sum(list, 'contacts_count') })
  return {
    rows: without,
    with: side(withP),
    without: side(without),
    shortDescriptions: without.filter((r) => (r.description_length || 0) < SHORT_DESCRIPTION).length,
    withVisits: without.filter((r) => r.upcoming > 0),
  }
}

/**
 * Loyer ou prix probablement saisi avec un zéro de trop : divisé par 10, il retombe
 * dans la fourchette du quartier.
 */
export const extraZero = (r) => r.market && r.market.ratio > 5
  && r.market.sqm / 10 >= r.market.ref.min && r.market.sqm / 10 <= r.market.ref.max

/** Annonces en ligne comparables au référentiel, de la plus chère à la moins chère au m². */
export function priceQueue(rows) {
  const online = rows.filter((r) => r.status === 'active')
  const compared = online.filter((r) => r.market).sort((a, b) => b.market.ratio - a.market.ratio)
  const above = compared.filter((r) => r.market.pos === 'above')
  const below = compared.filter((r) => r.market.pos === 'below')
  return {
    compared,
    above,
    below,
    out: [...above, ...below].sort((a, b) => Math.abs(Math.log(b.market.ratio)) - Math.abs(Math.log(a.market.ratio))),
    aboveContacts: sum(above, 'contacts_count'),
    noSurface: online.filter((r) => !r.surface),
    noRef: online.filter((r) => r.surface && !r.market),
    typo: above.find(extraZero) || null,
  }
}

const TONE_RANK = { crit: 0, warn: 1 }
export function statusQueue(rows) {
  return rows.filter((r) => r.status_check)
    .sort((a, b) => TONE_RANK[a.status_check.tone] - TONE_RANK[b.status_check.tone] || (b.views_count || 0) - (a.views_count || 0))
}

/** Brouillons, les plus suivis d'abord : republier prévient ceux qui les ont mis en favori. */
export function draftQueue(rows) {
  return rows.filter((r) => r.status === 'draft')
    .sort((a, b) => (b.favorites_count || 0) - (a.favorites_count || 0) || (b.views_count || 0) - (a.views_count || 0))
}

/** Badge « Urgent » payé : encore actif (`running`) ou déjà échu (`expired`). */
export function urgentBadge(p, now) {
  if (!p.is_urgent || !p.urgent_until) return null
  return { until: p.urgent_until, running: new Date(p.urgent_until) >= now }
}

/** Fiche de l'annonce : ce qui manque ou reste faible. `ok` | `meh` | `bad`. */
export function listingChecks(p) {
  return [
    { key: 'photos', state: p.images_count ? 'ok' : 'bad', value: p.images_count || 0 },
    { key: 'description', state: (p.description_length || 0) < 150 ? 'meh' : 'ok', value: p.description_length || 0 },
    { key: 'surface', state: p.surface ? 'ok' : 'bad', value: p.surface },
    { key: 'rooms', state: p.rooms ? 'ok' : 'meh', value: p.rooms },
    { key: 'energy', state: p.energy_class ? 'ok' : 'meh', value: p.energy_class },
    { key: 'published', state: p.published_at ? 'ok' : 'meh', value: p.published_at },
  ]
}

const SORTS = {
  todo: (a, b) => b.score - a.score || STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)
    || (b.views_count || 0) - (a.views_count || 0),
  views: (a, b) => (b.views_count || 0) - (a.views_count || 0),
  price: (a, b) => (b.price || 0) - (a.price || 0),
}
export const SORT_KEYS = Object.keys(SORTS)

/** Recherche (titre, référence, ville, quartier), filtres statut/type, puis tri. */
export function filterRows(rows, { q = '', status = '', type = '', sort = 'todo' } = {}) {
  const term = q.trim().toLowerCase()
  return rows
    .filter((r) => (!status || r.status === status) && (!type || r.property_type === type)
      && (!term || [r.title, r.reference, r.city, r.neighborhood].some((x) => (x || '').toLowerCase().includes(term))))
    .sort(SORTS[sort] || SORTS.todo)
}

export function paginate(rows, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(Math.max(1, page), pages)
  return { pages, page: current, from: (current - 1) * size, items: rows.slice((current - 1) * size, current * size) }
}

/** Abscisse (0-100 %) d'un rapport au prix moyen, sur l'échelle 0 à 200 %. */
export const xPct = (ratio) => (Math.min(Math.max(ratio, 0), MAX_RATIO) / MAX_RATIO) * 100

/** Visites passées et à venir d'un bien : l'issue des passées dit si les visiteurs viennent. */
export function splitVisits(visits = [], now) {
  const upcoming = visits.filter((v) => new Date(v.scheduled_at) >= now && ['scheduled', 'confirmed'].includes(v.status))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const past = visits.filter((v) => new Date(v.scheduled_at) < now)
  return { upcoming, past: past.length, completed: past.filter((v) => v.status === 'completed').length }
}
