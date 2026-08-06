import { describe, it, expect } from 'vitest'
import { localeFor, formatDate, formatNumber, formatCurrency } from './format'

describe('format utils', () => {
  it('localeFor mappe fr et ar', () => {
    expect(localeFor('fr')).toBe('fr-FR')
    expect(localeFor('ar')).toBe('ar-MA')
    expect(localeFor('xx')).toBe('fr-FR')
  })

  it('formatDate: mois localisé en arabe, jour identique', () => {
    const d = new Date('2026-01-15T00:00:00Z')
    const fr = formatDate(d, 'fr', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    const ar = formatDate(d, 'ar', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    expect(fr).toContain('janvier')
    expect(ar).not.toContain('janvier')
    expect(ar).not.toBe(fr)
  })

  it('formatNumber: chiffres latins même en arabe', () => {
    const n = 12345.6
    const fr = formatNumber(n, 'fr')
    const ar = formatNumber(n, 'ar')
    expect(/[0-9]/.test(fr)).toBe(true)
    expect(/[0-9]/.test(ar)).toBe(true)
    // pas de chiffres indo-arabes (٠-٩)
    expect(/[٠-٩]/.test(ar)).toBe(false)
  })

  it('formatCurrency: MAD, chiffres latins en arabe', () => {
    const ar = formatCurrency(1000, 'ar', { currency: 'MAD' })
    expect(/[٠-٩]/.test(ar)).toBe(false)
    expect(/[0-9]/.test(ar)).toBe(true)
  })

  it('formatDate: entrée vide/invalide renvoie chaîne vide', () => {
    expect(formatDate(null, 'fr')).toBe('')
    expect(formatDate('not-a-date', 'fr')).toBe('')
  })
})
