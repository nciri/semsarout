import { describe, it, expect } from 'vitest'
import {
  budgetMatches, buildDossiers, byUrgency, EMPTY_FILTERS, ficheAlerts, fixes, flagOf, hotProperties,
  maskEmail, maskPhone, matches, relanceBuckets, timelineOf, timeScale, visitsWithoutOffer,
} from './model'

const NOW = new Date('2026-07-27T09:00:00')
const ago = (d) => new Date(NOW - d * 864e5).toISOString()

const CLIENTS = [
  { id: 1, first_name: 'Aicha', last_name: 'Tazi', client_type: 'buyer', status: 'prospect', city: 'Casablanca', assigned_to_id: 20, budget_min: 1e6, budget_max: 3e6 },
  { id: 2, first_name: 'Omar', last_name: 'Belhaj', client_type: 'tenant', status: 'active', city: 'Rabat', assigned_to_id: 18, budget_max: 4890000 },
  { id: 3, first_name: 'Nadia', last_name: 'Bennani', client_type: 'investor', status: 'inactive', city: 'Marrakech', assigned_to_id: 17 },
  { id: 4, first_name: 'Nadia', last_name: 'Bennani', client_type: 'seller', status: 'active', city: 'Fès', tags: ['VIP'], phone: '+212 633582888' },
]
const SUMMARY = {
  clients: [
    { id: 1, last_exchange_at: null, interactions_count: 0, visits: [], leads: [{ id: 9, status: 'new', created_at: ago(40) }] },
    { id: 2, last_exchange_at: ago(15), interactions_count: 1, leads: [], visits: [
      { id: 5, property_id: 106, property_title: 'Loft Bir Rami', scheduled_at: ago(15), status: 'completed', client_feedback: 'very_interested' },
      { id: 6, property_id: 106, property_title: 'Loft Bir Rami', scheduled_at: ago(-10), status: 'confirmed' },
    ] },
    { id: 3, last_exchange_at: ago(17), interactions_count: 0, leads: [], visits: [
      { id: 7, property_id: 106, property_title: 'Loft Bir Rami', scheduled_at: ago(17), status: 'completed', client_feedback: 'very_interested' },
    ] },
    { id: 4, last_exchange_at: ago(3), interactions_count: 2, visits: [], leads: [] },
  ],
  duplicates: [{ ids: [3, 4], reasons: ['name'] }],
}
const TX = [{ id: 1, client_id: 1, property_id: 98, status: 'active', stage: 'final_act', transaction_type: 'sale', contact_date: ago(3) }]

const dossiers = () => buildDossiers({ clients: CLIENTS, summary: SUMMARY, transactions: TX, now: NOW })

describe('dossiers clients', () => {
  it('calcule étape, retard de relance et signaux de chaque client', () => {
    const [aicha, omar, nadia, nadia2] = dossiers()
    expect(aicha).toMatchObject({ stage: 'tx', age: null, overdue: true })
    expect(flagOf(aicha)).toEqual({ tone: 'crit', key: 'staleLead' })
    expect(omar).toMatchObject({ stage: 'visited', age: 15, overdue: false, badBudget: true })
    expect(omar.upcoming).toHaveLength(1)
    // Inactive mais a visité il y a 17 jours : le statut contredit l'activité.
    expect(nadia).toMatchObject({ inactiveButActive: true, overdue: false, duplicates: [4] })
    expect(nadia2).toMatchObject({ stage: 'contact', noAgent: true, duplicates: [3] })
  })

  it('trie du plus ancien échange au plus récent, jamais en tête, inactifs en fin', () => {
    expect(dossiers().sort(byUrgency).map((d) => d.id)).toEqual([1, 2, 4, 3])
  })

  it('filtre par étape, type, statut, et cherche aussi dans les étiquettes et le téléphone', () => {
    const ds = dossiers()
    const f = (x) => ds.filter((d) => matches(d, { ...EMPTY_FILTERS, ...x })).map((d) => d.id)
    expect(f({ stage: 'visited' })).toEqual([2, 3])
    expect(f({ type: 'tenant' })).toEqual([2])
    expect(f({ status: 'inactive' })).toEqual([3])
    expect(f({ q: 'vip' })).toEqual([4])
    expect(f({ q: '3358' })).toEqual([4])
  })

  it('répartit les relances et ignore les inactifs', () => {
    expect(relanceBuckets(dossiers())).toEqual({ fresh: 1, mid: 1, late: 0, never: 1 })
  })

  it('repère les visites sans offre et le bien qui attire sans convertir', () => {
    const rows = visitsWithoutOffer(dossiers())
    expect(rows.map((r) => r.v.id)).toEqual([5, 7])
    expect(hotProperties(rows)).toEqual([{ id: 106, title: 'Loft Bir Rami', names: ['Omar Belhaj', 'Nadia Bennani'] }])
  })

  it('rapproche le budget des acheteurs des biens en vente de leur ville', () => {
    const props = [{ transaction_type: 'sale', status: 'active', city: 'casablanca', price: 2e6 }]
    expect(budgetMatches(dossiers(), props)).toEqual({ buyers: 1, matched: 1 })
    expect(budgetMatches(dossiers(), [{ ...props[0], price: 5e6 }])).toEqual({ buyers: 1, matched: 0 })
  })

  it('compte les fiches à corriger sans compter deux fois un client', () => {
    const f = fixes(dossiers())
    expect(f).toMatchObject({ pairs: 1, total: 3 })
    expect(f.dups.map((d) => d.id)).toEqual([3, 4])
  })

  it('liste les constats de la fiche dans l\'ordre d\'urgence', () => {
    const ds = dossiers()
    const byId = new Map(ds.map((d) => [d.id, d]))
    expect(ficheAlerts(ds[0], byId).map((a) => a.key)).toEqual(['txNever', 'staleLead'])
    expect(ficheAlerts(ds[1], byId).map((a) => a.key)).toEqual(['hotNoOffer', 'badBudget'])
    expect(ficheAlerts(ds[1], byId)[0].revisit.id).toBe(6)
    expect(ficheAlerts(ds[2], byId).map((a) => a.key)).toEqual(['hotNoOffer', 'inactiveVisit', 'duplicate'])
  })
})

describe('frise', () => {
  it('place leads, échanges, visites et transactions sur une même échelle', () => {
    const history = { events: [
      { kind: 'lead', date: ago(40), status: 'lost' },
      { kind: 'interaction', date: ago(20) },
      { kind: 'visit', date: ago(-5), status: 'confirmed' },
      { kind: 'visit', date: 'n/a', status: 'completed' },
    ] }
    const ev = timelineOf(history, [{ status: 'won', closing_date: ago(10), created_at: ago(30) }])
    expect(ev.map((e) => [e.lane, e.state])).toEqual([['lead', 'ko'], ['inter', 'done'], ['tx', 'done'], ['visit', 'todo']])
    const s = timeScale(ev, NOW)
    expect(s.t0 < new Date(ago(40)) && s.t1 > new Date(ago(-5))).toBe(true)
    expect(s.major.map((d) => d.getMonth())).toEqual([6, 7])
    expect(s.ticks.length).toBeGreaterThan(s.major.length)
  })
})

describe('masquage des coordonnées', () => {
  it('garde de quoi reconnaître, pas de quoi recopier', () => {
    expect(maskPhone('+212 651740429')).toBe('+212 6••••••29')
    expect(maskEmail('client1@email.com')).toBe('c•••@email.com')
    expect(maskPhone(null)).toBe('')
  })
})
