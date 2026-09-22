import { describe, it, expect } from 'vitest'
import { conversionOf, isOpen, sourceShares, statusHistory } from './model'

describe('modèle de la page Leads', () => {
  it('regroupe les sources hors palette en « other », masqué quand il est vide', () => {
    const s = sourceShares([{ source: 'website', count: 3 }, { source: 'manual', count: 2 }, { source: 'service_request', count: 1 }])
    expect(s.total).toBe(6)
    expect(s.rows.find((r) => r.source === 'other').count).toBe(3)
    expect(s.rows.find((r) => r.source === 'phone_reveal').count).toBe(0)
    expect(sourceShares([{ source: 'website', count: 1 }]).rows.some((r) => r.source === 'other')).toBe(false)
  })

  it('calcule un entonnoir cumulatif et le taux de conversion', () => {
    const c = conversionOf([
      { status: 'new', count: 15 }, { status: 'contacted', count: 8 }, { status: 'qualified', count: 2 },
      { status: 'converted', count: 5 }, { status: 'lost', count: 2 },
    ])
    expect(c).toMatchObject({ received: 32, contacted: 15, qualified: 7, converted: 5, lost: 2 })
    expect(c.rate).toBeCloseTo(5 / 32)
    expect(conversionOf([]).rate).toBe(0)
  })

  it('reconstitue l\'historique, y compris les étapes sans date', () => {
    expect(statusHistory({ status: 'new', created_at: 'a' })).toEqual([{ key: 'received', at: 'a' }])
    expect(statusHistory({ status: 'converted', created_at: 'a', contacted_at: 'b', converted_at: 'd' }).map((s) => [s.key, s.at]))
      .toEqual([['received', 'a'], ['contacted', 'b'], ['qualified', null], ['converted', 'd']])
    expect(statusHistory({ status: 'lost', created_at: 'a', contacted_at: 'b' }).map((s) => s.key))
      .toEqual(['received', 'contacted', 'lost'])
  })

  it('ne propose d\'avancer que les leads ouverts', () => {
    expect(['new', 'contacted', 'qualified'].every(isOpen)).toBe(true)
    expect(isOpen('converted') || isOpen('lost')).toBe(false)
  })
})
