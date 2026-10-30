/**
 * Currency utilities for Moroccan Dirham (MAD)
 */

/**
 * Le symbole du dirham — source unique pour tout le site.
 *
 * Orthographe `Dh`, celle que rend le formateur i18n (`dashboard.units.dirham`) sur ses
 * 26 appels. Le `Đh` qui vivait ici donnait deux orthographes du dirham sur le même produit,
 * et chaque littéral qui le recopiait contournait en plus la locale arabe. Les surfaces
 * traduites passent par `t('dashboard.units.dirham')` ; cette constante sert les surfaces
 * qui n'ont pas de contexte i18n (annuaire public, écrans d'administration).
 */
export const DIRHAM_SYMBOL = 'Dh'

/**
 * Format a number as currency (without symbol)
 * @param {number} amount - The amount to format
 * @param {boolean} showDecimals - Whether to show decimal places
 * @returns {string} Formatted number string
 */
export function formatNumber(amount, showDecimals = false) {
  if (amount === null || amount === undefined) return '-'

  const num = typeof amount === 'string' ? parseFloat(amount) : amount

  if (isNaN(num)) return '-'

  return num.toLocaleString('fr-MA', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0
  })
}

/**
 * Format price with Dirham symbol suffix
 * @param {number} amount - The amount to format
 * @param {object} options - Formatting options
 * @returns {string} Formatted price string with symbol
 */
export function formatPrice(amount, options = {}) {
  const {
    showDecimals = false,
    compact = false,
    suffix = true
  } = options

  if (amount === null || amount === undefined) return '-'

  let num = typeof amount === 'string' ? parseFloat(amount) : amount

  if (isNaN(num)) return '-'

  let formatted
  let unit = ''

  if (compact && num >= 1000000) {
    formatted = formatNumber(num / 1000000, true)
    unit = 'M'
  } else if (compact && num >= 1000) {
    formatted = formatNumber(num / 1000, num >= 10000 ? false : true)
    unit = 'K'
  } else {
    formatted = formatNumber(num, showDecimals)
  }

  return suffix ? `${formatted}${unit} ${DIRHAM_SYMBOL}` : `${formatted}${unit}`
}

/**
 * i18n key (namespace `common:propertyCard`) for a rental price period suffix.
 * Defaults to monthly for legacy listings with no `price_period` set.
 */
export function pricePeriodKey(pricePeriod) {
  return { day: 'perDay', week: 'perWeek', month: 'perMonth' }[pricePeriod] || 'perMonth'
}

// Montant sans symbole, format français (9900 -> "9 900"). Vient de l'ancien constants/pricing.js,
// supprimé : les montants ne sont plus des constantes, ils viennent du catalogue (billing).
export const priceLabel = (n) => Number(n).toLocaleString('fr-FR')

export const priceWithSymbol = (n) => `${priceLabel(n)} ${DIRHAM_SYMBOL}`
