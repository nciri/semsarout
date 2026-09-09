import { describe, it, expect, vi } from 'vitest'
import { installServiceWorkerReload } from './swReload'

function fakeContainer(initialController) {
  let handler
  return {
    controller: initialController,
    addEventListener: (evt, fn) => { if (evt === 'controllerchange') handler = fn },
    fire() { handler?.() },
    setController(c) { this.controller = c },
  }
}

describe('installServiceWorkerReload', () => {
  it("ne recharge PAS au tout premier controllerchange d'un nouveau visiteur (I13)", () => {
    const sw = fakeContainer(null) // aucun controller au chargement
    const reload = vi.fn()
    installServiceWorkerReload(sw, reload)

    sw.setController({}) // activation initiale, comme le ferait le vrai navigateur
    sw.fire()

    expect(reload).not.toHaveBeenCalled()
  })

  it("recharge au controllerchange suivant, même pour ce même visiteur resté sur l'onglet (arbitrage round 2)", () => {
    // La garde ne doit tenir compte que d'une seule moitié : un nouveau visiteur qui traverse
    // ensuite un VRAI déploiement (un controller existait déjà avant CET événement) doit bien
    // recharger — sinon il reste bloqué sur des fragments hachés disparus.
    const sw = fakeContainer(null)
    const reload = vi.fn()
    installServiceWorkerReload(sw, reload)

    sw.setController({}) // 1er événement : activation initiale, ignorée
    sw.fire()
    expect(reload).not.toHaveBeenCalled()

    sw.setController({}) // 2e événement : un vrai remplacement, un controller existait déjà
    sw.fire()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('recharge dès le premier controllerchange pour un visiteur qui avait déjà un controller au chargement', () => {
    const sw = fakeContainer({}) // controller déjà présent au chargement (onglet resté ouvert)
    const reload = vi.fn()
    installServiceWorkerReload(sw, reload)

    sw.fire()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('ne recharge qu’une seule fois même si plusieurs controllerchange arrivent après coup', () => {
    const sw = fakeContainer({})
    const reload = vi.fn()
    installServiceWorkerReload(sw, reload)

    sw.fire()
    sw.fire()
    sw.fire()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("ne fait rien sans support serviceWorker (pas d'exception)", () => {
    expect(() => installServiceWorkerReload(undefined, vi.fn())).not.toThrow()
  })
})
