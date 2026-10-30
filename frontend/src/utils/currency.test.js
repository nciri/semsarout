import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import fr from '../locales/fr/backoffice.json'
import ar from '../locales/ar/backoffice.json'
import { DIRHAM_SYMBOL, priceWithSymbol } from './currency'

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

/** Tous les `.js`/`.jsx` sous `src/`, sans dépendance de parcours en plus. */
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return sources(full)
    return /\.jsx?$/.test(e.name) ? [full] : []
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

  it('aucun fichier source ne recopie l’autre symbole en dur', () => {
    const fautifs = sources(SRC)
      .filter((f) => !/currency(\.test)?\.js$/.test(f))
      .filter((f) => fs.readFileSync(f, 'utf8').includes(INTERDIT))
      .map((f) => path.relative(SRC, f))
    expect(fautifs, 'passer par DIRHAM_SYMBOL ou t("dashboard.units.dirham")').toEqual([])
  })
})
