/**
 * Calculs de la boutique du back-office (catalogue, paniers, commandes, dépenses).
 * Fonctions pures : le rendu n'a plus qu'à afficher, et les règles se testent sans DOM.
 */

// En dessous, un bien à meubler risque de ne plus trouver l'article au moment de payer.
export const LOW_STOCK = 3

export const stockSignal = (stock) => (!stock || stock < 1 ? 'out' : stock <= LOW_STOCK ? 'low' : 'ok')

/** Une ligne dont le produit a quitté le catalogue (supprimé ou désactivé). */
export const isRetired = (item) => item.available === false || item.product_id == null

export const hasRetired = (order) => (order.items || []).some(isRetired)

/** Écart relatif entre deux prix (0,31 = +31 %). */
export const priceDelta = (now, then) => (then ? (now - then) / then : 0)

export const FLOW = ['pending', 'paid', 'preparing', 'shipped', 'delivered']
const IN_PROGRESS = ['paid', 'preparing', 'shipped']

export const ORDER_FILTERS = {
  all: () => true,
  pending: (o) => o.status === 'pending',
  progress: (o) => IN_PROGRESS.includes(o.status),
  done: (o) => o.status === 'delivered',
}

/** État de chaque étape du suivi : faite, en cours, ou à venir. */
export function stepStates(status) {
  const k = FLOW.indexOf(status)
  return FLOW.map((_, i) => (i < k || (i === k && status === 'delivered') ? 'done' : i === k ? 'now' : 'todo'))
}

/** Commandes non annulées et non livrées, ventilées par statut. */
export function openOrders(orders = []) {
  const open = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'delivered')
  const by = Object.fromEntries(FLOW.map((s) => [s, 0]))
  for (const o of orders) if (o.status in by) by[o.status] += 1
  const retiredPending = open.filter((o) => o.status === 'pending' && hasRetired(o))
  return { count: open.length, by, retiredPending }
}

export function cartStats(items = []) {
  return {
    count: items.reduce((n, it) => n + it.quantity, 0),
    total: items.reduce((n, it) => n + (it.line_total || 0), 0),
    low: items.filter((it) => it.product && stockSignal(it.product.stock) === 'low'),
  }
}

/** Historique d'achat par produit (lignes `by_product` du résumé des dépenses). */
export const purchaseIndex = (byProduct = []) => new Map(byProduct.filter((r) => r.product_id).map((r) => [r.product_id, r]))

/**
 * Dépenses par catégorie. Un produit retiré n'a plus de catégorie connue : il garde une
 * ligne à son nom, pour que l'argent engagé dessus reste visible.
 */
export function spendByCategory(byProduct = [], products = []) {
  const cat = new Map(products.map((p) => [p.id, p]))
  const rows = new Map()
  for (const r of byProduct) {
    const p = r.product_id && cat.get(r.product_id)
    const key = p ? p.category : `retired:${r.product_name}`
    const row = rows.get(key) || { key, category: p?.category || null, group: p?.group || null, name: r.product_name, paid: 0, pending: 0 }
    row.paid += r.paid
    row.pending += r.pending
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => b.paid + b.pending - (a.paid + a.pending))
}

export function groupSplit(rows = []) {
  const out = { furniture: { paid: 0, pending: 0 }, appliance: { paid: 0, pending: 0 }, retired: { paid: 0, pending: 0 } }
  for (const r of rows) {
    const g = out[r.group] || out.retired
    g.paid += r.paid
    g.pending += r.pending
  }
  return out
}

/** Produits achetés qui coûtent plus cher aujourd'hui, la plus forte hausse d'abord. */
export function priceRises(byProduct = []) {
  return byProduct
    .filter((r) => r.available && r.last_unit_price && r.current_price > r.last_unit_price)
    .map((r) => ({ ...r, delta: priceDelta(r.current_price, r.last_unit_price) }))
    .sort((a, b) => b.delta - a.delta)
}

/** Ce que coûterait aujourd'hui le rachat des mêmes quantités, en plus. */
export function rebuy(byProduct = []) {
  const live = byProduct.filter((r) => r.available && r.last_unit_price)
  const rising = priceRises(byProduct)
  return {
    quantity: live.reduce((n, r) => n + r.quantity, 0),
    risingQuantity: rising.reduce((n, r) => n + r.quantity, 0),
    extra: rising.reduce((n, r) => n + (r.current_price - r.last_unit_price) * r.quantity, 0),
  }
}

export const latestMonth = (byMonth = []) => byMonth.filter((m) => m.month).at(-1) || null

/** Articles par acheteur, lus dans les commandes non annulées. */
export function buyerItems(orders = []) {
  const out = new Map()
  for (const o of orders) {
    if (o.status === 'cancelled') continue
    const list = out.get(o.buyer_id) || []
    for (const it of o.items || []) list.push({ name: it.product_name, quantity: it.quantity })
    out.set(o.buyer_id, list)
  }
  return out
}

export function filterProducts(products = [], { group = '', category = '', q = '' }) {
  const needle = q.trim().toLowerCase()
  return products.filter((p) => (!group || p.group === group) && (!category || p.category === category)
    && (!needle || p.name.toLowerCase().includes(needle)))
}

export const DAY = 86400000
export const daysSince = (iso, now) => Math.floor((now - new Date(iso)) / DAY)
