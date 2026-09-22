import { describe, it, expect } from 'vitest'
import { dealValue, isOverdue, milestones, queryParams, sinceFor, stagesFor, withType } from './model'

const NOW = new Date(2026, 8, 22)

describe('registre des transactions — règles pures', () => {
  it('borne la période au jour près, « tout » sans borne', () => {
    expect(sinceFor('90', NOW)).toBe('2026-06-24')
    expect(sinceFor('30', NOW)).toBe('2026-08-23')
    expect(sinceFor('all', NOW)).toBe('')
  })

  it("n'envoie pas les filtres vides", () => {
    expect(queryParams({ type: '', stage: 'offer', page: 1, q: '', since: '' })).toEqual({ stage: 'offer', page: 1 })
  })

  it("propose les étapes du type choisi, et toutes sans type", () => {
    expect(stagesFor('rent')).toContain('move_in')
    expect(stagesFor('rent')).not.toContain('offer')
    expect(stagesFor('')).toEqual(expect.arrayContaining(['offer', 'move_in', 'contact']))
    expect(stagesFor('').filter((s) => s === 'contact')).toHaveLength(1)
  })

  it("change de type : garde l'étape commune, vide l'étape propre à l'autre type", () => {
    expect(withType({ stage: 'visit', page: 3 }, 'rent')).toEqual({ stage: 'visit', type: 'rent', page: 1 })
    expect(withType({ stage: 'offer', page: 3 }, 'rent').stage).toBe('')
  })

  it('prend le meilleur prix connu', () => {
    expect(dealValue({ asking_price: 100, offer_price: 90, final_price: 95 })).toBe(95)
    expect(dealValue({ asking_price: 100, offer_price: 90, final_price: null })).toBe(90)
    expect(dealValue({ asking_price: 100 })).toBe(100)
  })

  it('ordonne les jalons datés et remplace la clôture prévue par la date de clôture', () => {
    const open = { status: 'active', contact_date: '2026-07-24', visit_date: null, expected_closing_date: '2026-08-27' }
    expect(milestones(open).map((m) => m.key)).toEqual(['contact', 'expected'])
    const lost = { status: 'lost', contact_date: '2026-07-24', closed_at: '2026-07-22', expected_closing_date: '2026-10-10' }
    expect(milestones(lost).map((m) => m.key)).toEqual(['contact', 'lostOn'])
    expect(milestones({ ...lost, status: 'won' }).at(-1).key).toBe('closedOn')
  })

  it('signale une clôture prévue dépassée seulement sur une affaire ouverte', () => {
    expect(isOverdue({ status: 'active', expected_closing_date: '2026-08-27' }, NOW)).toBe(true)
    expect(isOverdue({ status: 'active', expected_closing_date: '2026-10-27' }, NOW)).toBe(false)
    expect(isOverdue({ status: 'won', closed_at: '2026-07-01', expected_closing_date: '2026-06-01' }, NOW)).toBe(false)
  })
})
