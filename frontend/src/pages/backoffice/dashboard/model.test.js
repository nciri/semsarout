import { describe, it, expect } from 'vitest'
import { agingBuckets, agingTone, funnelOf, monthResults, periodWeeks, repeatedContacts, stageTotals, weekDays, listingInsights } from './model'

const NOW = new Date('2026-07-27T09:00:00')
const ago = (d) => new Date(NOW - d * 864e5).toISOString()

describe('ancienneté des leads', () => {
  it('rougit au-delà de 14 jours, pas à 14', () => {
    expect(agingTone(15)).toBe('crit')
    expect(agingTone(14)).toBe('warn')
    expect(agingTone(2)).toBe('good')
    expect(agingBuckets([{ created_at: ago(1) }, { created_at: ago(9) }, { created_at: ago(40) }], NOW))
      .toEqual({ fresh: 1, recent: 1, stale: 1 })
  })

  it('repère un contact qui a écrit plusieurs fois', () => {
    expect(repeatedContacts([{ name: 'Hind' }, { name: 'Hind' }, { name: 'Ali' }, { name: 'Hind' }]))
      .toEqual([{ name: 'Hind', count: 3 }])
  })
})

describe('entonnoir', () => {
  it('est cumulatif : un converti compte aussi comme contacté et qualifié', () => {
    // En statut brut, il y a plus de convertis (3) que de qualifiés (1) : l'entonnoir s'inverserait.
    const f = funnelOf([{ by_status: { new: 2, contacted: 1, qualified: 1, converted: 3, lost: 1 } }])
    expect(f).toEqual({ received: 8, contacted: 5, qualified: 4, converted: 3, lost: 1 })
  })

  it('compare à une période précédente de même durée, seulement si elle existe', () => {
    const weeks = Array.from({ length: 5 }, (_, i) => ({ week: `w${i}` }))
    expect(periodWeeks(weeks, 30).previous).toBeNull()
    expect(periodWeeks(weeks, 7).previous.map((w) => w.week)).toEqual(['w3'])
  })
})

describe('pipeline et résultats', () => {
  it('additionne montant et pondéré par étape', () => {
    expect(stageTotals([{ count: 1, amount: 100, weighted: 50 }, { count: 2, amount: 300, weighted: 60 }]))
      .toEqual({ count: 3, amount: 400, weighted: 110 })
  })

  it('isole les ventes perdues du mois et les ventes signées du mois précédent', () => {
    const r = monthResults([
      { date: '2026-07-12T10:00:00', type: 'sale', status: 'lost', amount: 6720318 },
      { date: '2026-07-22T10:00:00', type: 'sale', status: 'lost', amount: 1211875 },
      { date: '2026-07-05T10:00:00', type: 'rent', status: 'lost', amount: 14000 },
      { date: '2026-07-03T10:00:00', type: 'rent', status: 'won', amount: 2903 },
      { date: '2026-06-26T10:00:00', type: 'sale', status: 'won', amount: 729494 },
    ], NOW)
    expect(r.lostSale).toEqual({ count: 2, amount: 7932193 })
    expect(r.wonRent).toEqual({ count: 1, amount: 2903 })
    expect(r.prevWonSale).toEqual({ count: 1, amount: 729494 })
    expect([r.won, r.lost]).toEqual([1, 3])
  })
})

describe('semaine et annonces', () => {
  it('démarre la semaine au lundi et marque aujourd hui', () => {
    const days = weekDays([{ scheduled_at: '2026-07-30T09:30:00' }, { scheduled_at: '2026-07-30T11:30:00' }], NOW)
    expect(days[0].date.getDay()).toBe(1)
    expect(days.find((d) => d.isToday).date.getDate()).toBe(27)
    expect(days[3].count).toBe(2)
  })

  it('met en tête des annonces sans contact la plus chère', () => {
    const ins = listingInsights([
      { id: 1, transaction_type: 'sale', price: 900, views: 10, contacts: 0 },
      { id: 2, transaction_type: 'sale', price: 7000, views: 5, contacts: 0 },
      { id: 3, transaction_type: 'rent', price: 50, views: 100, contacts: 4 },
    ])
    expect(ins.zero.map((l) => l.id)).toEqual([2, 1])
    expect(ins.zeroViews).toBe(15)
    expect(ins.ranked[0].id).toBe(3)
  })
})
