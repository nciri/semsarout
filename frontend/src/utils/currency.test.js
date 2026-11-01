import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import fr from '../locales/fr/backoffice.json'
import ar from '../locales/ar/backoffice.json'
import { DIRHAM_SYMBOL, formatNumber, formatPrice, priceWithSymbol } from './currency'

/**
 * Une seule orthographe du dirham sur tout le produit.
 *
 * Deux coexistaient : `Dh`, rendu par le formateur i18n sur ses 26 appels, et l'autre, recopié
 * en dur sur sept surfaces d'argent. Le littéral ne faisait pas que diverger : il contournait
 * la locale arabe, où le dirham s'écrit « درهم ». Ce test interdit son retour, plutôt que de
 * constater l'état d'un jour donné — c'est le seul moyen qu'il ne revienne pas.
 */
const SRC = path.resolve(process.cwd(), 'src')
const INTERDIT = 'Đh'

/** Tous les `.js`/`.jsx`/`.json` sous `src/`, sans dépendance de parcours en plus. */
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return sources(full)
    return /\.(jsx?|json)$/.test(e.name) ? [full] : []
  })
}

describe('dirham — une seule orthographe', () => {
  it('la constante partagée porte celle du formateur i18n', () => {
    expect(DIRHAM_SYMBOL).toBe('Dh')
    expect(fr.dashboard.units.dirham).toBe(DIRHAM_SYMBOL)
    // `toLocaleString('fr-FR')` sépare avec une espace fine insécable (U+202F), pas U+0020.
    expect(priceWithSymbol(9900)).toBe(`9\u202f900 ${DIRHAM_SYMBOL}`)
    // …et la locale arabe a bien son propre mot : c'est ce que le littéral contournait.
    expect(ar.dashboard.units.dirham).not.toBe(DIRHAM_SYMBOL)
  })

  it('groupe les milliers à l’espace fine, jamais au point', () => {
    // `fr-MA` rend « 1.500.000 » : le simulateur de crédit affichait des points là où le reste
    // du produit (`priceLabel`, en `fr-FR`) affichait des espaces.
    // U+202F (espace fine insécable) via `fromCharCode` : le caractère littéral est
    // invisible à la relecture et refusé par `no-irregular-whitespace` dans un gabarit.
    const fine = String.fromCharCode(0x202f)
    expect(formatNumber(1500000)).toBe(`1${fine}500${fine}000`)
    expect(formatPrice(1500000)).toBe(`1${fine}500${fine}000 ${DIRHAM_SYMBOL}`)
    expect(formatNumber(1500000)).not.toContain('.')
    // La décimale reste la virgule française, elle : seul le groupeur change.
    expect(formatNumber(1234.5, true)).toBe(`1${fine}234,50`)
  })

  it('aucun fichier source ne recopie l’autre symbole en dur', () => {
    const fautifs = sources(SRC)
      .filter((f) => !/currency(\.test)?\.js$/.test(f))
      .filter((f) => fs.readFileSync(f, 'utf8').includes(INTERDIT))
      .map((f) => path.relative(SRC, f))
    expect(fautifs, 'passer par DIRHAM_SYMBOL ou t("dashboard.units.dirham")').toEqual([])
  })
})
