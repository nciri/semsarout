import { describe, it, expect } from 'vitest'
import { ageTone, arrearsByLease, chartTop, dueTone, groupByProperty, leaseFindings, maskEmail, maskPhone, matches, periodState } from './model'

const NOW = new Date('2026-07-27T10:00:00')

describe('periodState', () => {
  it('distingue payé, payé en retard, partiel, impayé et à venir', () => {
    expect(periodState({ status: 'paid', due_date: '2026-07-01T00:00:00', paid_at: '2026-07-06T09:00:00' }, NOW)).toBe('paid')
    expect(periodState({ status: 'paid', due_date: '2026-07-01T00:00:00', paid_at: '2026-07-07T09:00:00' }, NOW)).toBe('paid_late')
    expect(periodState({ status: 'partial', due_date: '2026-07-05T00:00:00' }, NOW)).toBe('partial')
    // Jamais relancée, l'échéance est encore `pending` en base : elle est pourtant en retard.
    expect(periodState({ status: 'pending', due_date: '2026-07-26T00:00:00' }, NOW)).toBe('late')
    expect(periodState({ status: 'pending', due_date: '2026-07-27T00:00:00' }, NOW)).toBe('upcoming')
    expect(periodState({ status: 'partial', due_date: '2026-08-05T00:00:00' }, NOW)).toBe('upcoming')
  })
})

describe('masquage des coordonnées', () => {
  it('garde de quoi reconnaître, pas de quoi recopier', () => {
    expect(maskEmail('amine.tazi@gmail.com')).toBe('a•••••@gmail.com')
    expect(maskPhone('+212 661 23 45 18')).toBe('+2126••••••18')
    expect(maskPhone('0612')).toBe('•••')
    expect(maskEmail(null)).toBe('')
    expect(maskPhone(undefined)).toBe('')
  })
})

describe('seuils', () => {
  it('colore l’ancienneté et les échéances', () => {
    expect([10, 15, 45, 46].map((d) => ageTone(d))).toEqual(['good', 'warn', 'warn', 'crit'])
    expect([2, 3, 10, 11].map((d) => ageTone(d, 3, 10))).toEqual(['good', 'warn', 'warn', 'crit'])
    expect([7, 8, 30, 31].map(dueTone)).toEqual(['crit', 'warn', 'warn', 'neutral'])
  })
})

it('filtre sur plusieurs champs, sans tenir compte de la casse', () => {
  expect(matches('gauth', 'Appartement Gauthier', null)).toBe(true)
  expect(matches('', 'x')).toBe(true)
  expect(matches('rabat', 'Casablanca', 'BAIL-1')).toBe(false)
})

it('regroupe les impayés par bail, du plus gros montant dû au plus petit', () => {
  const g = arrearsByLease([
    { lease_id: 1, rest: 4000, age_days: 22 },
    { lease_id: 2, rest: 3000, age_days: 87 },
    { lease_id: 2, rest: 3000, age_days: 56 },
  ])
  expect(g.map((x) => [x.lease_id, x.owed, x.count, x.age])).toEqual([[2, 6000, 2, 87], [1, 4000, 1, 22]])
})

it('regroupe les candidatures par bien, les plus demandés d’abord', () => {
  const g = groupByProperty([{ property_id: 1 }, { property_id: 2 }, { property_id: 2 }])
  expect(g.map((x) => [x.property_id, x.apps.length])).toEqual([[2, 2], [1, 1]])
})

describe('leaseFindings', () => {
  const lease = { status: 'active', deposit_amount: 13000, end_date: '2026-07-31T00:00:00', inventories: { entree: null, sortie: null } }
  it('liste impayés, retards répétés, état des lieux manquant et fin proche', () => {
    const periods = [
      { status: 'paid', total_amount: 7000, due_date: '2026-03-05T00:00:00', paid_at: '2026-03-15T00:00:00' },
      { status: 'paid', total_amount: 7000, due_date: '2026-04-05T00:00:00', paid_at: '2026-04-15T00:00:00' },
      { status: 'paid', total_amount: 7000, due_date: '2026-05-05T00:00:00', paid_at: '2026-05-12T00:00:00' },
      { status: 'paid', total_amount: 7000, due_date: '2026-06-05T00:00:00', paid_at: '2026-06-05T00:00:00' },
      { status: 'partial', total_amount: 7000, paid_amount: 3000, due_date: '2026-07-05T00:00:00' },
    ]
    const f = leaseFindings(lease, periods, NOW)
    expect(f.map((x) => x.key)).toEqual(['owed', 'paysLate', 'entryMissing', 'ending'])
    expect(f[0]).toMatchObject({ owed: 4000, months: 1 })
    expect(f[1]).toMatchObject({ count: 3, paid: 4, avg: 9 })
    expect(f[3]).toMatchObject({ days: 4 })
  })
  it('ne dit rien d’un bail sain', () => {
    const ok = { ...lease, end_date: null, inventories: { entree: { status: 'signed' } } }
    expect(leaseFindings(ok, [{ status: 'paid', due_date: '2026-07-05T00:00:00', paid_at: '2026-07-05T00:00:00' }], NOW)).toEqual([])
  })
})

it('arrondit l’axe du graphe à un palier lisible', () => {
  expect(chartTop([12000, 7000])).toEqual({ top: 15000, step: 5000 })
  expect(chartTop([0, 0])).toEqual({ top: 1000, step: 250 })
  expect(chartTop([72000])).toEqual({ top: 80000, step: 20000 })
})
