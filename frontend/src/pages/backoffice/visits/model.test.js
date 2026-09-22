import { describe, it, expect } from 'vitest'
import { actionsFor, attendance, byDay, daysOf, formPayload, isOverdue, localIso, rangeOf, shift, toInputValue } from './model'

const NOW = new Date(2026, 8, 22, 12, 0) // mardi 22 septembre 2026, midi
const at = (d, h = 10) => localIso(new Date(2026, 8, d, h, 0))

describe('fenêtres d’agenda', () => {
  it('la semaine va du lundi au dimanche, même depuis un dimanche', () => {
    expect(daysOf('week', NOW).map((d) => d.getDate())).toEqual([21, 22, 23, 24, 25, 26, 27])
    expect(daysOf('week', new Date(2026, 8, 27)).map((d) => d.getDate())[0]).toBe(21)
    expect(daysOf('day', NOW)).toHaveLength(1)
  })

  it('bornes en heure locale et navigation', () => {
    const { start, end } = rangeOf('week', NOW)
    expect(localIso(start)).toBe('2026-09-21T00:00:00')
    expect(localIso(end)).toBe('2026-09-28T00:00:00')
    expect(shift('week', NOW, -1).getDate()).toBe(15)
    expect(shift('day', NOW, 1).getDate()).toBe(23)
  })

  it('range les visites par jour et par heure', () => {
    const days = byDay([{ id: 2, scheduled_at: at(22, 15) }, { id: 1, scheduled_at: at(22, 9) }, { id: 3, scheduled_at: at(24) }], daysOf('week', NOW))
    expect(days[1].visits.map((v) => v.id)).toEqual([1, 2])
    expect(days[3].visits.map((v) => v.id)).toEqual([3])
    expect(days[0].visits).toEqual([])
  })

  it('valeur datetime-local sans décalage de fuseau', () => {
    expect(toInputValue('2026-09-22T10:30:00')).toBe('2026-09-22T10:30')
    expect(toInputValue(null)).toBe('')
  })
})

describe('requalification', () => {
  it('une visite passée encore planifiée ou confirmée est à requalifier', () => {
    expect(isOverdue({ status: 'scheduled', scheduled_at: at(21) }, NOW)).toBe(true)
    expect(isOverdue({ status: 'confirmed', scheduled_at: at(21) }, NOW)).toBe(true)
    expect(isOverdue({ status: 'completed', scheduled_at: at(21) }, NOW)).toBe(false)
    expect(isOverdue({ status: 'scheduled', scheduled_at: at(23) }, NOW)).toBe(false)
  })

  it('propose honorée / absent / annulée pour une visite passée', () => {
    expect(actionsFor({ status: 'confirmed', scheduled_at: at(20) }, NOW)).toEqual(['complete', 'no_show', 'cancel', 'edit', 'delete'])
    expect(actionsFor({ status: 'scheduled', scheduled_at: at(25) }, NOW)).toEqual(['confirm', 'cancel', 'edit', 'delete'])
    expect(actionsFor({ status: 'confirmed', scheduled_at: at(25) }, NOW)).toEqual(['complete', 'cancel', 'edit', 'delete'])
    expect(actionsFor({ status: 'completed', scheduled_at: at(20) }, NOW)).toEqual(['report', 'edit', 'delete'])
    expect(actionsFor({ status: 'no_show', scheduled_at: at(20) }, NOW)).toEqual(['edit', 'delete'])
  })

  it('le taux de présence ignore les visites non requalifiées', () => {
    expect(attendance({ completed: 3, cancelled: 1, no_show: 0, unresolved: 6 })).toEqual({ resolved: 4, rate: 75 })
    expect(attendance({ completed: 0, cancelled: 0, no_show: 0, unresolved: 2 })).toEqual({ resolved: 0, rate: null })
    expect(attendance(undefined).rate).toBeNull()
  })
})

it('le formulaire envoie des nombres et des null, jamais de chaînes vides', () => {
  const p = formPayload({ property_id: '4', client_id: '', agent_id: 7, visitor_name: '  Amine ', visitor_email: '', visitor_phone: '', scheduled_at: '2026-09-22T10:00', duration_minutes: '45', notes: '' })
  expect(p).toEqual({ property_id: 4, client_id: null, agent_id: 7, visitor_name: 'Amine', visitor_email: null, visitor_phone: null, scheduled_at: '2026-09-22T10:00', duration_minutes: 45, notes: null })
})
