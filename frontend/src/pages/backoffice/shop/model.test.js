import { describe, expect, it } from 'vitest'
import {
  buyerItems, cartStats, filterProducts, groupSplit, hasRetired, latestMonth, openOrders, priceRises, rebuy,
  spendByCategory, stepStates, stockSignal,
} from './model'

// Données de l'agence 1 (base de développement, juillet 2026).
const products = [
  { id: 1, category: 'lit', group: 'furniture', name: 'Lit double 160x200', price: 3499, stock: 8 },
  { id: 2, category: 'canape', group: 'furniture', name: "Canapé d'angle 4 places", price: 5799, stock: 3 },
  { id: 4, category: 'armoire', group: 'furniture', name: 'Armoire 3 portes', price: 4199, stock: 2 },
  { id: 5, category: 'refrigerateur', group: 'appliance', name: 'Réfrigérateur combiné 300L', price: 4500, stock: 0 },
]
const byProduct = [
  { product_id: 2, product_name: "Canapé d'angle 4 places", quantity: 3, paid: 14400, pending: 0, last_unit_price: 4800, current_price: 5799, available: true },
  { product_id: 4, product_name: 'Armoire 3 portes', quantity: 3, paid: 9600, pending: 0, last_unit_price: 3200, current_price: 4199, available: true },
  { product_id: 1, product_name: 'Lit double 160x200', quantity: 1, paid: 3499, pending: 0, last_unit_price: 3499, current_price: 3499, available: true },
  { product_id: null, product_name: 'Four à supprimer', quantity: 2, paid: 0, pending: 1000, last_unit_price: 500, current_price: null, available: false },
]
const retiredLine = { product_id: null, product_name: 'Four à supprimer', quantity: 1, available: false }
const orders = [
  { id: 13, status: 'preparing', buyer_id: 3, items: [{ product_id: 1, product_name: 'Lit', quantity: 1, available: true }] },
  { id: 11, status: 'pending', buyer_id: 22, total: 500, items: [retiredLine] },
  { id: 10, status: 'paid', buyer_id: 21, items: [{ product_id: 4, product_name: 'Armoire', quantity: 3, available: true }] },
  { id: 7, status: 'pending', buyer_id: 18, total: 500, items: [retiredLine] },
  { id: 6, status: 'paid', buyer_id: 17, items: [] },
  { id: 5, status: 'cancelled', buyer_id: 3, items: [retiredLine] },
]

describe('boutique : stock et commandes', () => {
  it('signale la rupture et le stock faible (≤ 3)', () => {
    expect([0, 1, 3, 4].map(stockSignal)).toEqual(['out', 'low', 'low', 'ok'])
  })

  it('repère un article retiré, même sans le champ available (API plus ancienne)', () => {
    expect(hasRetired({ items: [{ product_id: null }] })).toBe(true)
    expect(hasRetired({ items: [{ product_id: 4, available: true }] })).toBe(false)
  })

  it('compte les commandes en cours et celles à régler sur un article retiré', () => {
    const o = openOrders(orders)
    expect(o.count).toBe(5)
    expect(o.by).toMatchObject({ pending: 2, paid: 2, preparing: 1, shipped: 0, delivered: 0 })
    expect(o.retiredPending.map((x) => x.id)).toEqual([11, 7])
  })

  it("marque les étapes franchies, l'étape en cours et une livraison achevée", () => {
    expect(stepStates('paid')).toEqual(['done', 'now', 'todo', 'todo', 'todo'])
    expect(stepStates('delivered')).toEqual(['done', 'done', 'done', 'done', 'done'])
  })

  it('totalise le panier et relève les articles en stock faible', () => {
    const s = cartStats([{ quantity: 2, line_total: 8398, product: { stock: 2 } }, { quantity: 1, line_total: 1900, product: { stock: 9 } }])
    expect(s).toMatchObject({ count: 3, total: 10298 })
    expect(s.low).toHaveLength(1)
  })
})

describe('boutique : dépenses', () => {
  it('regroupe par catégorie et garde une ligne pour le produit retiré', () => {
    const rows = spendByCategory(byProduct, products)
    expect(rows.map((r) => [r.key, r.paid, r.pending])).toEqual([
      ['canape', 14400, 0], ['armoire', 9600, 0], ['lit', 3499, 0], ['retired:Four à supprimer', 0, 1000],
    ])
    expect(groupSplit(rows)).toEqual({
      furniture: { paid: 27499, pending: 0 }, appliance: { paid: 0, pending: 0 }, retired: { paid: 0, pending: 1000 },
    })
  })

  it('classe les hausses de prix et chiffre le rachat des mêmes quantités', () => {
    expect(priceRises(byProduct).map((r) => [r.product_id, Math.round(r.delta * 100)])).toEqual([[4, 31], [2, 21]])
    expect(rebuy(byProduct)).toEqual({ quantity: 7, risingQuantity: 6, extra: 5994 })
  })

  it('prend le dernier mois connu', () => {
    expect(latestMonth([{ month: '2026-06', paid: 1 }, { month: '2026-07', paid: 2 }])).toMatchObject({ month: '2026-07' })
    expect(latestMonth([])).toBeNull()
  })

  it('liste les articles par acheteur hors commandes annulées', () => {
    const m = buyerItems(orders)
    expect(m.get(21)).toEqual([{ name: 'Armoire', quantity: 3 }])
    expect(m.get(3)).toEqual([{ name: 'Lit', quantity: 1 }])
  })
})

describe('boutique : catalogue', () => {
  it('filtre par groupe, catégorie et recherche insensible à la casse', () => {
    expect(filterProducts(products, { group: 'appliance' }).map((p) => p.id)).toEqual([5])
    expect(filterProducts(products, { category: 'lit' }).map((p) => p.id)).toEqual([1])
    expect(filterProducts(products, { q: ' ARMOIRE ' }).map((p) => p.id)).toEqual([4])
  })
})
