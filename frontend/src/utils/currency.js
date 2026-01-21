/**
 * Currency utilities for Moroccan Dirham (MAD)
 */

/**
 * The Dirham symbol - D with vertical bar (like $ but with D)
 * Using Unicode combining character for the strikethrough effect
 */
export const DIRHAM_SYMBOL = 'Đ'

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

  // Return with Dirham symbol (Đ - D with stroke)
  return suffix ? `${formatted}${unit} ${DIRHAM_SYMBOL}` : `${formatted}${unit}`
}

/**
 * Format price for display in property cards (compact)
 */
export function formatPropertyPrice(price, transactionType = 'sale') {
  if (!price) return '-'

  const formatted = formatPrice(price, { compact: true })

  if (transactionType === 'rent') {
    return `${formatted}/mois`
  }

  return formatted
}
