/**
 * Formatage localisé (dates, heures, nombres, devise) réactif à la langue i18next.
 *
 * DÉCISION IMPOSÉE : les nombres (et les nombres à l'intérieur des dates) sont
 * toujours formatés avec `numberingSystem: 'latn'`, y compris en arabe. C'est
 * l'usage marocain courant (chiffres 0-9, pas ٠-٩ indo-arabes). Seuls les noms
 * de mois/jours restent traduits en arabe via Intl (ex: "يناير").
 */
import { useTranslation } from 'react-i18next'

const LOCALE_BY_LANG = {
  fr: 'fr-FR',
  ar: 'ar-MA',
}

export function localeFor(lang) {
  return LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.fr
}

export function formatDate(date, lang, opts = {}) {
  if (date === null || date === undefined || date === '') return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(localeFor(lang), { numberingSystem: 'latn', ...opts }).format(d)
}

export function formatTime(date, lang, opts = { hour: '2-digit', minute: '2-digit' }) {
  return formatDate(date, lang, opts)
}

export function formatDateTime(date, lang, opts = {}) {
  return formatDate(date, lang, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  })
}

export function formatNumber(n, lang, opts = {}) {
  if (n === null || n === undefined || n === '') return ''
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (Number.isNaN(num)) return ''
  return new Intl.NumberFormat(localeFor(lang), { numberingSystem: 'latn', ...opts }).format(num)
}

export function formatCurrency(n, lang, opts = {}) {
  const { currency = 'MAD', ...rest } = opts
  if (n === null || n === undefined || n === '') return ''
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (Number.isNaN(num)) return ''
  return new Intl.NumberFormat(localeFor(lang), {
    numberingSystem: 'latn',
    style: 'currency',
    currency,
    ...rest,
  }).format(num)
}

/**
 * Hook: renvoie des fonctions de formatage déjà liées à la langue i18n courante.
 */
export function useFormat() {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'fr'

  return {
    lang,
    locale: localeFor(lang),
    fmtDate: (date, opts) => formatDate(date, lang, opts),
    fmtTime: (date, opts) => formatTime(date, lang, opts),
    fmtDateTime: (date, opts) => formatDateTime(date, lang, opts),
    fmtNumber: (n, opts) => formatNumber(n, lang, opts),
    fmtCurrency: (n, opts) => formatCurrency(n, lang, opts),
  }
}
