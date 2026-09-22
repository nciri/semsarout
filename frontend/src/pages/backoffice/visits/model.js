/**
 * Règles de la page « Visites & RDV » : fenêtres d'agenda, requalification et actions permises.
 * Les dates de visite sont stockées en heure locale « naïve » (saisie datetime-local) : on les
 * relit et on les réécrit sans fuseau, pour que 10:00 saisi reste 10:00 affiché.
 */

const OPEN = ['scheduled', 'confirmed']
const pad = (n) => String(n).padStart(2, '0')
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** « 2026-09-22T10:00:00 » : format attendu par les filtres date_from / date_to de l'API. */
export const localIso = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

/** Valeur d'un <input type="datetime-local"> à partir d'une date d'API. */
export const toInputValue = (iso) => (iso ? localIso(new Date(iso)).slice(0, 16) : '')

/** Jours affichés : la journée, ou la semaine du lundi au dimanche qui contient `anchor`. */
export function daysOf(mode, anchor) {
  const day = startOfDay(anchor)
  if (mode === 'day') return [day]
  const monday = addDays(day, -((day.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Bornes [début, fin) de la fenêtre, pour la requête. */
export function rangeOf(mode, anchor) {
  const days = daysOf(mode, anchor)
  return { start: days[0], end: addDays(days.at(-1), 1) }
}

export const shift = (mode, anchor, dir) => addDays(startOfDay(anchor), dir * (mode === 'day' ? 1 : 7))

export const sameDay = (a, b) => startOfDay(new Date(a)).getTime() === startOfDay(new Date(b)).getTime()

/** Visites de chaque jour, dans l'ordre de la journée. */
export function byDay(visits, days) {
  const sorted = [...visits].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
  return days.map((date) => ({ date, visits: sorted.filter((v) => sameDay(v.scheduled_at, date)) }))
}

/** Passée mais toujours planifiée ou confirmée : personne n'a dit ce qui s'est passé. */
export const isOverdue = (v, now) => OPEN.includes(v.status) && new Date(v.scheduled_at) < now

/**
 * Taux de présence sur les visites requalifiées uniquement : une visite passée restée
 * « planifiée » n'est ni une présence ni une absence, elle est comptée à part.
 */
export function attendance(recent) {
  const r = recent || {}
  const resolved = (r.completed || 0) + (r.cancelled || 0) + (r.no_show || 0)
  return { resolved, rate: resolved ? Math.round(((r.completed || 0) / resolved) * 100) : null }
}

/** Actions proposées dans la fiche, selon le statut et le moment de la visite. */
export function actionsFor(v, now) {
  const out = []
  if (isOverdue(v, now)) out.push('complete', 'no_show', 'cancel')
  else if (v.status === 'scheduled') out.push('confirm', 'cancel')
  else if (v.status === 'confirmed') out.push('complete', 'cancel')
  else if (v.status === 'completed') out.push('report')
  return [...out, 'edit', 'delete']
}

/** Corps envoyé à l'API depuis le formulaire (champs vides → null, identifiants en nombre). */
export function formPayload(f) {
  const id = (x) => (x === '' || x == null ? null : Number(x))
  const txt = (x) => (x && x.trim() ? x.trim() : null)
  return {
    property_id: id(f.property_id),
    client_id: id(f.client_id),
    agent_id: id(f.agent_id),
    visitor_name: txt(f.visitor_name),
    visitor_email: txt(f.visitor_email),
    visitor_phone: txt(f.visitor_phone),
    scheduled_at: f.scheduled_at,
    duration_minutes: Number(f.duration_minutes) || 30,
    notes: txt(f.notes),
  }
}
