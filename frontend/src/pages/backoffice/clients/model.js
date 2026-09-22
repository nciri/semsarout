/**
 * Calculs de la page Clients, à partir de `GET /backoffice/clients`, de la synthèse crm
 * (`/backoffice/clients/summary`) et des transactions. Fonctions pures, testées sans DOM.
 */

const DAY = 86400000
export const daysBetween = (from, to) => Math.floor((to - from) / DAY)

// Trois semaines sans nouvelles : au-delà, un client actif a souvent vu un autre agent.
export const OVERDUE_DAYS = 21
// Un loyer mensuel ne dépasse pas 100 000 Dh : au-delà, le budget a été saisi comme un prix d'achat.
const RENT_BUDGET_CEILING = 100000
const RECENT_ACTIVITY_DAYS = 31

// Ordre fixe des couloirs : il porte l'ordre des couleurs catégorielles du tableau de bord.
export const LANES = [
  { key: 'lead', color: '#009683' },
  { key: 'inter', color: '#3366CC' },
  { key: 'visit', color: '#B8842A' },
  { key: 'tx', color: '#C04A86' },
]

export const STAGES = ['all', 'tx', 'visited', 'planned', 'contact', 'none']
export const CLIENT_TYPES = ['buyer', 'seller', 'landlord', 'tenant', 'investor']
export const CLIENT_STATUSES = ['active', 'prospect', 'inactive']

export const fullName = (c) => c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()

export const ageTone = (age) => (age === null ? 'crit' : age > OVERDUE_DAYS ? 'crit' : age > 7 ? 'warn' : 'good')

const groupBy = (rows, key) => rows.reduce((m, r) => m.set(r[key], [...(m.get(r[key]) || []), r]), new Map())

/** Dossier de chaque client : tout ce qui s'y rattache, calculé une fois. */
export function buildDossiers({ clients = [], summary, transactions = [], now }) {
  const sum = new Map((summary?.clients || []).map((s) => [s.id, s]))
  const txBy = groupBy(transactions, 'client_id')
  const dupOf = new Map()
  for (const g of summary?.duplicates || []) {
    for (const id of g.ids) dupOf.set(id, [...new Set([...(dupOf.get(id) || []), ...g.ids.filter((x) => x !== id)])])
  }
  return clients.map((c) => {
    const s = sum.get(c.id) || {}
    const visits = s.visits || []
    const leads = s.leads || []
    const tx = txBy.get(c.id) || []
    const at = (v) => new Date(v.scheduled_at)
    const honored = visits.filter((v) => v.status === 'completed' && at(v) <= now)
    const upcoming = visits.filter((v) => ['scheduled', 'confirmed'].includes(v.status) && at(v) > now)
    const txActive = tx.filter((t) => t.status === 'active')
    const lastIso = s.last_exchange_at || c.last_contact_at
    const last = lastIso ? new Date(lastIso) : null
    const age = last ? daysBetween(last, now) : null
    const stage = txActive.length ? 'tx' : honored.length ? 'visited' : upcoming.length ? 'planned'
      : (s.interactions_count || last) ? 'contact' : 'none'
    const recent = txActive.length > 0 || honored.some((v) => daysBetween(at(v), now) <= RECENT_ACTIVITY_DAYS)
    return {
      id: c.id,
      client: c,
      name: fullName(c),
      visits, honored, upcoming, leads, tx, txActive, last, age, stage,
      overdue: c.status !== 'inactive' && (age === null || age > OVERDUE_DAYS),
      noOffer: honored.filter((v) => !tx.some((t) => t.property_id === v.property_id)),
      staleLeads: leads.filter((l) => l.status === 'new'),
      duplicates: dupOf.get(c.id) || [],
      inactiveButActive: c.status === 'inactive' && recent,
      badBudget: c.client_type === 'tenant' && (c.budget_max || 0) >= RENT_BUDGET_CEILING,
      noAgent: !c.assigned_to_id,
    }
  })
}

/** Les inactifs en fin de liste ; sinon du plus ancien échange au plus récent, « jamais » en tête. */
export const sortKey = (d) => (d.client.status === 'inactive' ? 1e6 : 0) - (d.age === null ? 1e4 : d.age)
export const byUrgency = (a, b) => sortKey(a) - sortKey(b)

export const EMPTY_FILTERS = { stage: 'all', q: '', type: '', status: '' }

export function matches(d, f, typeLabel = (x) => x, ignoreStage = false) {
  const c = d.client
  if (!ignoreStage && f.stage !== 'all' && d.stage !== f.stage) return false
  if (f.type && c.client_type !== f.type) return false
  if (f.status && c.status !== f.status) return false
  if (!f.q) return true
  const q = f.q.toLowerCase().trim()
  const hay = [d.name, c.city, typeLabel(c.client_type), c.email, ...(c.tags || [])].join(' ').toLowerCase()
  const digits = q.replace(/\D/g, '')
  return hay.includes(q) || (digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits))
}

/** Ancienneté du dernier échange des clients actifs ou prospects. */
export function relanceBuckets(dossiers) {
  const out = { fresh: 0, mid: 0, late: 0, never: 0 }
  for (const d of dossiers) {
    if (d.client.status === 'inactive') continue
    out[d.age === null ? 'never' : d.age > OVERDUE_DAYS ? 'late' : d.age > 7 ? 'mid' : 'fresh'] += 1
  }
  return out
}

/** Le signal le plus urgent d'une ligne, ou null. */
export function flagOf(d) {
  if (d.staleLeads.length) return { tone: 'crit', key: 'staleLead' }
  if (d.overdue && d.txActive.length) return { tone: 'crit', key: 'txUnfollowed' }
  if (d.inactiveButActive) return { tone: 'warn', key: 'reviewStatus' }
  if (d.noOffer.some((v) => v.client_feedback === 'very_interested')) return { tone: 'warn', key: 'hotNoOffer' }
  if (d.duplicates.length) return { tone: 'warn', key: 'duplicate' }
  return null
}

/** Visites honorées sans transaction sur le bien visité, la plus récente d'abord. */
export function visitsWithoutOffer(dossiers) {
  return dossiers.flatMap((d) => d.noOffer.map((v) => ({ d, v })))
    .sort((a, b) => new Date(b.v.scheduled_at) - new Date(a.v.scheduled_at))
}

/** Biens visités par au moins deux clients très intéressés, sans offre de leur part. */
export function hotProperties(rows) {
  const by = new Map()
  for (const { d, v } of rows) {
    if (v.client_feedback !== 'very_interested') continue
    const p = by.get(v.property_id) || { id: v.property_id, title: v.property_title, names: [] }
    if (!p.names.includes(d.name)) p.names.push(d.name)
    by.set(v.property_id, p)
  }
  return [...by.values()].filter((p) => p.names.length > 1)
}

/** Acheteurs et investisseurs ayant au moins un bien en vente dans leur ville et leur budget. */
export function budgetMatches(dossiers, properties = []) {
  const sale = properties.filter((p) => p.transaction_type === 'sale' && p.status === 'active')
  const buyers = dossiers.filter((d) => ['buyer', 'investor'].includes(d.client.client_type)
    && d.client.status !== 'inactive' && d.client.budget_max)
  const matched = buyers.filter(({ client: c }) => {
    const cities = [c.city, ...(c.search_criteria?.locations || [])].filter(Boolean).map((x) => x.toLowerCase())
    return sale.some((p) => cities.includes((p.city || '').toLowerCase())
      && p.price >= (c.budget_min || 0) && p.price <= c.budget_max)
  })
  return { buyers: buyers.length, matched: matched.length }
}

/** Fiches dont le contenu contredit l'activité réelle. */
export function fixes(dossiers) {
  const dups = dossiers.filter((d) => d.duplicates.length).sort((a, b) => a.name.localeCompare(b.name))
  const inactive = dossiers.filter((d) => d.inactiveButActive)
  const budget = dossiers.filter((d) => d.badBudget)
  const noAgent = dossiers.filter((d) => d.noAgent)
  const ids = new Set([...dups, ...inactive, ...budget, ...noAgent].map((d) => d.id))
  const pairs = new Set(dups.flatMap((d) => d.duplicates.map((o) => [d.id, o].sort((a, b) => a - b).join('-')))).size
  return { dups, inactive, budget, noAgent, total: ids.size, pairs }
}

/** Constats de la fiche d'un client, dans l'ordre d'urgence. `others` résout un doublon par id. */
export function ficheAlerts(d, others = new Map()) {
  const out = []
  if (d.overdue && d.txActive.length) out.push({ tone: 'crit', key: d.age === null ? 'txNever' : 'txLate', count: d.txActive.length })
  else if (d.overdue) out.push({ tone: 'warn', key: d.age === null ? 'never' : 'late' })
  for (const l of d.staleLeads) out.push({ tone: 'crit', key: 'staleLead', lead: l })
  for (const v of d.noOffer.filter((x) => x.client_feedback === 'very_interested')) {
    out.push({ tone: 'info', key: 'hotNoOffer', visit: v, revisit: d.upcoming.find((u) => u.property_id === v.property_id) })
  }
  if (d.inactiveButActive) out.push({ tone: 'warn', key: d.txActive.length ? 'inactiveTx' : 'inactiveVisit', count: d.txActive.length, visit: d.honored.at(-1) })
  for (const id of d.duplicates) if (others.get(id)) out.push({ tone: 'plain', key: 'duplicate', other: others.get(id) })
  if (d.badBudget) out.push({ tone: 'plain', key: 'badBudget' })
  if (d.noAgent) out.push({ tone: 'warn', key: 'noAgent' })
  return out
}

/** Leads, échanges, visites (historique crm) et transactions sur une seule échelle de temps. */
export function timelineOf(history, transactions = []) {
  const ev = []
  for (const e of history?.events || []) {
    const date = new Date(e.date)
    if (Number.isNaN(date.getTime())) continue
    if (e.kind === 'lead') ev.push({ lane: 'lead', date, state: e.status === 'lost' ? 'ko' : 'done', data: e })
    else if (e.kind === 'interaction') ev.push({ lane: 'inter', date, state: 'done', data: e })
    else if (e.kind === 'visit') {
      ev.push({ lane: 'visit', date, data: e,
        state: e.status === 'completed' ? 'done' : ['cancelled', 'no_show'].includes(e.status) ? 'ko' : 'todo' })
    }
  }
  for (const t of transactions) {
    const iso = t.status === 'active' ? (t.contact_date || t.created_at) : (t.closing_date || t.created_at)
    const date = new Date(iso)
    if (!Number.isNaN(date.getTime())) ev.push({ lane: 'tx', date, state: t.status === 'lost' ? 'ko' : 'done', data: t })
  }
  return ev.sort((a, b) => a.date - b.date)
}

/** Bornes de la frise (événements et aujourd'hui, avec une marge) et graduations au 1er et au 15. */
export function timeScale(events, now) {
  const times = [...events.map((e) => e.date.getTime()), now.getTime()]
  const lo = Math.min(...times)
  const hi = Math.max(...times)
  const pad = Math.max(3 * DAY, (hi - lo) * 0.04)
  const t0 = new Date(lo - pad)
  const t1 = new Date(hi + pad)
  const months = []
  for (let d = new Date(t0.getFullYear(), t0.getMonth() + 1, 1); d < t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d)
  const mids = months.length <= 4
    ? [new Date(t0.getFullYear(), t0.getMonth(), 15), ...months.map((m) => new Date(m.getFullYear(), m.getMonth(), 15))]
      .filter((d) => d > t0 && d < t1)
    : []
  return { t0, t1, ticks: [...months, ...mids].sort((a, b) => a - b), major: months }
}

/** « +212 6••••••29 » : assez pour reconnaître un numéro, pas pour le recopier depuis un écran. */
export function maskPhone(phone) {
  if (!phone) return ''
  const s = String(phone)
  let seen = 0
  const total = (s.match(/\d/g) || []).length
  return s.replace(/\d/g, (ch) => {
    seen += 1
    return seen <= 4 || seen > total - 2 ? ch : '•'
  })
}

export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || ''
  const [user, domain] = email.split('@')
  return `${user.charAt(0)}•••@${domain}`
}
