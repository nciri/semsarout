/**
 * Calculs de la page Pipeline, à partir de `GET /backoffice/transactions/pipeline`.
 * Fonctions pures : le rendu n'a plus qu'à afficher. Vente et location ne sont jamais
 * additionnées : chaque appel porte sur les dossiers d'un seul type.
 */

const DAY = 86400000
const SEVERITY = { crit: 0, warn: 1, info: 2 }

/** Montant d'un dossier : l'offre si elle est saisie, sinon le prix demandé. */
export const amountOf = (t) => Number(t.offer_price ?? t.asking_price ?? 0)
export const weightedOf = (t) => (amountOf(t) * (t.probability || 0)) / 100
const commissionOf = (t) => (t.commission_rate ? (amountOf(t) * t.commission_rate) / 100 : 0)

/** Cartes du kanban, à plat, avec leur étape. */
export const flatten = (pipeline = []) => pipeline.flatMap((s) => s.transactions.map((t) => ({ ...t, stage: s.id })))

/** Jours sans changement d'étape : servis par l'API, à défaut depuis l'entrée dans l'étape ou la création. */
export function daysInStage(t, now) {
  if (Number.isFinite(t.days_in_stage)) return t.days_in_stage
  const since = t.stage_entered_at || t.created_at
  return since ? Math.max(0, Math.floor((now - new Date(since)) / DAY)) : 0
}

export const idleTone = (days) => (days > 21 ? 'crit' : days > 14 ? 'warn' : 'neutral')

export const flagsOf = (t) => [...(t.flags || [])].sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity])
export const topSeverity = (t) => flagsOf(t)[0]?.severity || null
/** « À traiter » : un constat critique ou à faire ; une simple vérification ne bloque pas. */
export const isActionable = (t) => ['crit', 'warn'].includes(topSeverity(t))

export function totals(rows) {
  return rows.reduce((a, t) => ({
    count: a.count + 1,
    gross: a.gross + amountOf(t),
    weighted: a.weighted + weightedOf(t),
    commission: a.commission + (commissionOf(t) * (t.probability || 0)) / 100,
  }), { count: 0, gross: 0, weighted: 0, commission: 0 })
}

/** Constats à plat, du plus grave au moins grave, puis du dossier le plus immobile. */
export function todoItems(rows, now) {
  return rows.flatMap((t) => flagsOf(t).map((f) => ({ t, f })))
    .sort((a, b) => SEVERITY[a.f.severity] - SEVERITY[b.f.severity] || daysInStage(b.t, now) - daysInStage(a.t, now))
}

export function agentLoad(rows) {
  const by = new Map()
  for (const t of rows) {
    const k = t.agent_id ?? 0
    const a = by.get(k) || { id: k, name: t.agent_name, count: 0, gross: 0, weighted: 0, todo: 0 }
    a.count += 1
    a.gross += amountOf(t)
    a.weighted += weightedOf(t)
    if (isActionable(t)) a.todo += 1
    by.set(k, a)
  }
  return [...by.values()].sort((a, b) => b.weighted - a.weighted)
}

export function laneTotals(stages, rows) {
  return stages.map((s) => {
    const r = rows.filter((t) => t.stage === s.id)
    return { id: s.id, rows: r, gross: r.reduce((n, t) => n + amountOf(t), 0), weighted: r.reduce((n, t) => n + weightedOf(t), 0) }
  })
}

export function longestIdle(rows, now) {
  return rows.reduce((best, t) => (!best || daysInStage(t, now) > daysInStage(best, now) ? t : best), null)
}

/** Sorties récentes : gagnées, perdues, et la plus grosse perte (celle qui mérite d'être lue). */
export function outcomes(closed = []) {
  const won = closed.filter((c) => c.status === 'won')
  const lost = closed.filter((c) => c.status === 'lost')
  return {
    won: won.length,
    lost: lost.length,
    lostSum: lost.reduce((n, c) => n + (c.amount || 0), 0),
    biggestLost: lost.reduce((b, c) => (!b || c.amount > b.amount ? c : b), null),
  }
}

export function matches(t, { q = '', onlyTodo = false }) {
  if (onlyTodo && !isActionable(t)) return false
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [t.client_name, t.property_title, t.property_city, t.reference].filter(Boolean).join(' ').toLowerCase().includes(needle)
}

/** Déplace une carte dans la réponse en cache (mise à jour optimiste du kanban). */
export function moveInPipeline(data, id, stage, enteredAt, days = 0) {
  if (!data?.pipeline) return data
  const card = flatten(data.pipeline).find((t) => t.id === id)
  if (!card) return data
  const moved = { ...card, stage, stage_entered_at: enteredAt, days_in_stage: days }
  return {
    ...data,
    pipeline: data.pipeline.map((s) => ({
      ...s,
      transactions: [...s.transactions.filter((t) => t.id !== id), ...(s.id === stage ? [moved] : [])],
    })),
  }
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
