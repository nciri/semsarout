import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Régression : sur le hero sombre (`text-ivory`), les champs de la barre de recherche
// héritaient de cette couleur — texte blanc sur fond blanc, saisie invisible. La couleur
// doit être posée sur l'élément lui-même, pas laissée à l'héritage.
const css = fs.readFileSync(path.join(process.cwd(), 'src/assets/styles/index.css'), 'utf8')

describe('couleur de texte des champs de saisie', () => {
  it('input, textarea et select ont une couleur explicite dans la couche de base', () => {
    const rule = css.match(/input,\s*\n\s*textarea,\s*\n\s*select\s*\{([^}]*)\}/)
    expect(rule, 'règle input/textarea/select absente de index.css').not.toBeNull()
    expect(rule[1]).toMatch(/color:\s*#[0-9a-fA-F]{3,6}/)
  })
})
