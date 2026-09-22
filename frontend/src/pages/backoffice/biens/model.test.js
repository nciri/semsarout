import { describe, it, expect } from 'vitest'
import {
  draftQueue, enrich, extraZero, filterRows, overview, paginate, photoQueue, pricePosition, priceQueue,
  signalsOf, splitVisits, statusQueue, urgentBadge, xPct,
} from './model'

const NOW = new Date('2026-07-27T09:00:00')
const REF = { avg: 6000, min: 4500, max: 8000 }
// Biens tirés du jeu de données de l'agence 1.
const loft = { id: 106, title: 'Loft Bir Rami', status: 'active', transaction_type: 'sale', price: 7030000, surface: 120, price_ref: REF, images_count: 0, views_count: 335, contacts_count: 0, reference: 'PROP-0024', city: 'Kénitra', neighborhood: 'Bir Rami', property_type: 'land' }
const corniche = { id: 9, title: 'F4 rénové Corniche', status: 'draft', transaction_type: 'sale', price: 860000, surface: 53, images_count: 9, views_count: 3120, favorites_count: 97, city: 'Casablanca', property_type: 'apartment' }
const montFleuri = { id: 66, title: 'Appartement 3 pièces Mont Fleuri', status: 'active', transaction_type: 'rent', price: 12000, surface: 198, price_ref: { avg: 65, min: 45, max: 90 }, images_count: 10, views_count: 4240, contacts_count: 36, city: 'Fès', property_type: 'apartment' }
const malabata = { id: 104, title: 'Maison Malabata', status: 'pending', transaction_type: 'sale', price: 810000, images_count: 0, views_count: 452, status_check: { reason: 'won', expected: 'sold', tone: 'crit' }, city: 'Tanger', property_type: 'villa' }

describe('prix au m² face au quartier', () => {
  it('situe une annonce au-dessus, dans ou sous la fourchette', () => {
    const p = pricePosition(loft)
    expect(p.pos).toBe('above')
    expect(p.ratio).toBeCloseTo(9.76, 2)
    expect(pricePosition(montFleuri).pos).toBe('in')
    expect(pricePosition({ ...loft, price: 480000 }).pos).toBe('below')
  })

  it("ne compare ni sans surface, ni sans référence, ni un loyer à la nuit à un référentiel mensuel", () => {
    expect(pricePosition({ ...loft, surface: null })).toBeNull()
    expect(pricePosition({ ...loft, price_ref: null })).toBeNull()
    expect(pricePosition({ ...montFleuri, price_period: 'day' })).toBeNull()
  })

  it('repère le zéro de trop : divisé par 10, le prix retombe dans la fourchette', () => {
    expect(extraZero(enrich([loft])[0])).toBe(true)
    expect(extraZero(enrich([{ ...loft, price: 1500000 }])[0])).toBe(false)
  })

  it("borne l'échelle à 200 % de la moyenne", () => {
    expect(xPct(1)).toBe(50)
    expect(xPct(9.8)).toBe(100)
    expect(xPct(-1)).toBe(0)
  })
})

describe('signaux et tri « à traiter d’abord »', () => {
  it('liste ce qui freine une annonce, statut faux en premier', () => {
    expect(signalsOf(malabata).map((s) => s[1])).toEqual(['status'])
    expect(signalsOf(loft, { newLeads: 2 }).map((s) => s[1])).toEqual(['noPhoto', 'priceTimes', 'newLeads'])
    expect(signalsOf(montFleuri)).toEqual([])
    // Hors ligne, prix et photos ne freinent rien.
    expect(signalsOf({ ...loft, status: 'sold' })).toEqual([])
  })

  it('classe par gravité cumulée, puis statut, puis vues', () => {
    const rows = enrich([montFleuri, corniche, loft, malabata], { newLeads: [{ property_id: 66 }] })
    expect(filterRows(rows).map((r) => r.id)).toEqual([106, 104, 66, 9])
    expect(filterRows(rows, { sort: 'views' }).map((r) => r.id)).toEqual([66, 9, 104, 106])
    expect(filterRows(rows, { sort: 'price' })[0].id).toBe(106)
  })

  it('filtre par statut, type et recherche sur titre, référence, ville ou quartier', () => {
    const rows = enrich([montFleuri, corniche, loft])
    expect(filterRows(rows, { q: 'bir rami' }).map((r) => r.id)).toEqual([106])
    expect(filterRows(rows, { q: 'PROP-0024' }).map((r) => r.id)).toEqual([106])
    expect(filterRows(rows, { status: 'draft' }).map((r) => r.id)).toEqual([9])
    expect(filterRows(rows, { type: 'apartment', q: 'fès' }).map((r) => r.id)).toEqual([66])
  })

  it('pagine par 12 et ramène une page hors bornes dans la plage', () => {
    const rows = Array.from({ length: 30 }, (_, i) => i)
    expect(paginate(rows, 3)).toMatchObject({ pages: 3, page: 3, from: 24 })
    expect(paginate(rows, 9).page).toBe(3)
    expect(paginate([], 1)).toMatchObject({ pages: 1, page: 1, items: [] })
  })
})

describe('cartes « à traiter »', () => {
  const rows = enrich([montFleuri, corniche, loft, malabata], {
    newLeads: [{ property_id: 66 }, { property_id: 66 }, { property_id: 9 }],
    upcomingVisits: [{ property_id: 106, scheduled_at: '2026-08-02T09:30:00' }, { property_id: 106, scheduled_at: '2026-08-08T15:30:00' }],
  })

  it('résume le portefeuille : en ligne, vues, visites et demandes', () => {
    const o = overview(rows, {
      newLeads: [{ property_id: 66 }, { property_id: 66 }, { property_id: 9 }],
      upcomingVisits: [{ property_id: 106, scheduled_at: '2026-08-02T09:30:00' }, { property_id: 106, scheduled_at: '2026-08-08T15:30:00' }],
    })
    expect(o.online).toMatchObject({ total: 2, sale: 1, rent: 1, views: 4575, contacts: 36 })
    expect(o.buckets).toEqual({ active: 2, pending: 1, draft: 1, closed: 0 })
    expect(o.visits).toEqual({ count: 2, properties: 1, last: '2026-08-08T15:30:00' })
    expect(o.leads).toEqual({ count: 3, properties: 2 })
  })

  it('compare les contacts des annonces avec et sans photo', () => {
    const q = photoQueue(rows)
    expect(q.rows.map((r) => r.id)).toEqual([106])
    expect(q.with).toEqual({ count: 1, views: 4240, contacts: 36 })
    expect(q.without).toEqual({ count: 1, views: 335, contacts: 0 })
    expect(q.withVisits.map((r) => r.id)).toEqual([106])
  })

  it('isole les prix hors fourchette et le plus probable zéro de trop', () => {
    const q = priceQueue(rows)
    expect(q.compared.map((r) => r.id)).toEqual([106, 66])
    expect(q.above.map((r) => r.id)).toEqual([106])
    expect(q.typo.id).toBe(106)
  })

  it('met les statuts contredits par un dossier clos avant les déductions', () => {
    const warn = { ...montFleuri, id: 93, status: 'pending', status_check: { tone: 'warn' }, views_count: 9999 }
    expect(statusQueue(enrich([warn, malabata])).map((r) => r.id)).toEqual([104, 93])
  })

  it('met en tête le brouillon le plus suivi et dit si son badge urgent court encore', () => {
    expect(draftQueue(enrich([{ ...corniche, id: 2, favorites_count: 3 }, corniche]))[0].id).toBe(9)
    expect(urgentBadge({ is_urgent: true, urgent_until: '2026-07-29T00:00:00' }, NOW).running).toBe(true)
    expect(urgentBadge({ is_urgent: true, urgent_until: '2026-07-01T00:00:00' }, NOW).running).toBe(false)
    expect(urgentBadge({ is_urgent: false }, NOW)).toBeNull()
  })
})

describe('visites d’un bien', () => {
  it('sépare les visites à venir (planifiées ou confirmées) de l’issue des passées', () => {
    const v = splitVisits([
      { scheduled_at: '2026-07-10T18:30:00', status: 'completed' },
      { scheduled_at: '2026-07-19T13:30:00', status: 'cancelled' },
      { scheduled_at: '2026-08-04T09:30:00', status: 'scheduled' },
      { scheduled_at: '2026-08-02T18:30:00', status: 'confirmed' },
      { scheduled_at: '2026-08-05T18:30:00', status: 'cancelled' },
    ], NOW)
    expect(v.upcoming.map((x) => x.scheduled_at)).toEqual(['2026-08-02T18:30:00', '2026-08-04T09:30:00'])
    expect(v).toMatchObject({ past: 2, completed: 1 })
  })
})
