import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Verrou statique sur le découpage des routes (App.jsx). Depuis que les pages
// sont chargées par `lazy(() => import('...'))`, un chemin faux ou un module
// sans export par défaut ne casse plus la compilation : Vite génère quand même
// un fragment, et l'erreur n'apparaît qu'au clic de l'utilisateur sur la route
// concernée — c'est-à-dire en production. Ce test vérifie sans rien exécuter
// que chaque chemin existe et expose bien un `export default`.

const SRC = path.dirname(fileURLToPath(import.meta.url))
const APP = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8')

const lazyImports = [...APP.matchAll(/lazy\(\(\) => import\('(\.[^']+)'\)\)/g)].map((m) => m[1])

function resolve(rel) {
  const base = path.resolve(SRC, rel)
  return ['.jsx', '.js', '/index.jsx', '/index.js']
    .map((ext) => base + ext)
    .find((candidate) => fs.existsSync(candidate))
}

describe('routes chargées à la demande', () => {
  it('App.jsx découpe bien toutes ses pages (aucune régression vers des imports statiques)', () => {
    expect(lazyImports.length).toBeGreaterThanOrEqual(100)
    // Aucun `import X from './pages/...'` statique ne doit revenir : il
    // reconstituerait le fragment unique de 2,88 Mo que le découpage a éliminé.
    expect(APP).not.toMatch(/^import \w+ from '\.\/pages\//m)
  })

  it.each(lazyImports)('%s existe et exporte un composant par défaut', (rel) => {
    const file = resolve(rel)
    expect(file, `chemin introuvable depuis App.jsx : ${rel}`).toBeTruthy()
    const source = fs.readFileSync(file, 'utf8')
    expect(source, `${rel} n’a pas d’export par défaut`).toMatch(/^export default /m)
  })
})
