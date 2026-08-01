const NB = '\xa0'

export function formatMad(amount, { suffix = true } = {}) {
  const grouped = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, NB)
  const base = `${grouped}${NB}MAD`
  return suffix ? `${base}${NB}/mois` : base
}

export function frenchPunct(text) {
  return text.replace(/\s*([:;!?])/g, `${NB}$1`)
}

export function matchTone(pct) {
  return pct >= 80 ? 'strong' : 'normal'
}
