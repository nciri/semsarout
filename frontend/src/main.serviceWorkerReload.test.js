import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// I13 : à la toute première visite d'un nouveau visiteur, aucun `controller`
// n'existe encore (`registerType: 'autoUpdate'` → skipWaiting + clientsClaim
// activent le worker et déclenchent `controllerchange` sans qu'aucune mise à
// jour n'ait eu lieu). Sans le garde classique, la première page vue par
// n'importe quel visiteur — pas seulement les utilisateurs design3d — est
// rechargée de force, y compris en pleine saisie d'un formulaire.
const SRC = path.dirname(fileURLToPath(import.meta.url))
const MAIN = fs.readFileSync(path.join(SRC, 'main.jsx'), 'utf8')

describe("rechargement sur controllerchange (main.jsx)", () => {
  it("ne pose l'écouteur que si un service worker contrôle déjà la page", () => {
    const guardEnd = MAIN.indexOf("addEventListener('controllerchange'")
    const block = MAIN.slice(0, guardEnd)
    const lastIfIndex = block.lastIndexOf("if (")
    const guardCondition = block.slice(lastIfIndex, block.indexOf(')', lastIfIndex) + 1)
    // Sans ce garde, l'écouteur se pose sur la toute première visite (aucun
    // `controller` n'existe encore) et le premier `controllerchange` — émis
    // par `clientsClaim()` sans qu'aucune mise à jour n'ait eu lieu — recharge
    // la page en pleine saisie d'un formulaire.
    expect(guardCondition).toMatch(/navigator\.serviceWorker\.controller/)
  })
})
