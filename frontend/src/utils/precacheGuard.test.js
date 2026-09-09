import { describe, it, expect } from 'vitest'
import { assertPrecacheSizes, PRECACHE_MAX_BYTES, WORKBOX_NO_SIZE_FILTER } from './precacheGuard'

const MIO = 1024 * 1024

describe('garde-fou de taille du pré-cache', () => {
  it('laisse passer un manifeste dont tout tient sous la limite', () => {
    const manifest = [
      { url: 'assets/index-abc.js', size: 700 * 1024 },
      { url: 'assets/index-abc.css', size: 143 * 1024 },
    ]
    expect(assertPrecacheSizes(manifest)).toEqual({ manifest })
  })

  it('accepte un fichier exactement à la limite', () => {
    const manifest = [{ url: 'assets/pile.js', size: PRECACHE_MAX_BYTES }]
    expect(() => assertPrecacheSizes(manifest)).not.toThrow()
  })

  it('LÈVE dès qu’un fichier dépasse la limite, au lieu de l’exclure en silence', () => {
    const manifest = [
      { url: 'assets/index-abc.js', size: 700 * 1024 },
      { url: 'assets/monolithe-def.js', size: 2.88 * MIO },
    ]
    expect(() => assertPrecacheSizes(manifest)).toThrow(/monolithe-def\.js/)
    expect(() => assertPrecacheSizes(manifest)).toThrow(/2\.88 Mio/)
  })

  it('signale TOUS les fichiers fautifs, pas seulement le premier', () => {
    const manifest = [
      { url: 'a.js', size: 3 * MIO },
      { url: 'b.js', size: 4 * MIO },
    ]
    expect(() => assertPrecacheSizes(manifest)).toThrow(/2 fichier\(s\)/)
    expect(() => assertPrecacheSizes(manifest)).toThrow(/a\.js.*b\.js/s)
  })

  it('tolère un manifeste vide ou des entrées sans taille connue', () => {
    expect(assertPrecacheSizes([])).toEqual({ manifest: [] })
    expect(() => assertPrecacheSizes([{ url: 'sans-taille.js' }])).not.toThrow()
  })

  it('neutralise vraiment le filtrage Workbox (limite passée au plugin)', () => {
    // Si cette valeur redevenait un seuil réaliste, Workbox recommencerait à
    // filtrer en silence AVANT que le garde-fou ne voie le fichier.
    expect(WORKBOX_NO_SIZE_FILTER).toBeGreaterThan(1024 * MIO)
  })
})
