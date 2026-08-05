import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Heuristique read-only : repère un nœud de texte JSX (entre > et <, sans { } < >)
// contenant du français (accent OU mot FR courant) — signe d'une chaîne non
// enveloppée dans t(). Le texte dans {t('...')} est ignoré (contient des accolades).
const FR_HINT = /[àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]|\b(Accueil|Rechercher|Aucun|Aucune|Voir|Envoyer|Retour|Connexion|Pr[eé]c[eé]dent|Suivant|Ajouter|Modifier|Supprimer|Enregistrer|Annuler|Fermer|Chargement|Bienvenue|Notre|Nos|Votre|Vos|D[eé]couvrir|Contactez|Comparer|Biens|Page|introuvable|Copier|Copi[eé])\b/

export function findHardcodedText(source) {
  const hits = []
  const re = />([^<>{}]+)</g
  let m
  while ((m = re.exec(source)) !== null) {
    const text = m[1].replace(/\s+/g, ' ').trim()
    if (text && FR_HINT.test(text)) hits.push(text)
  }
  return hits
}

// Fichiers migrés à garder propres. AJOUTER chaque page ici après sa migration.
const MIGRATED_FILES = [
  'src/pages/NotFound.jsx',
  'src/pages/LegalPage.jsx',
  'src/pages/PaymentGateway.jsx',
  'src/pages/CheckoutConfirmation.jsx',
  'src/pages/About.jsx',
]

describe('noHardcodedText (garde-fou heuristique)', () => {
  it('détecte le français JSX non enveloppé', () => {
    expect(findHardcodedText('<div>Page introuvable</div>')).toEqual(['Page introuvable'])
  })

  it("ignore le texte enveloppé dans t()", () => {
    expect(findHardcodedText("<div>{t('public:notFound.title')}</div>")).toEqual([])
  })

  it('les fichiers migrés ne contiennent pas de français JSX non traduit', () => {
    for (const rel of MIGRATED_FILES) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
      const hits = findHardcodedText(src)
      expect(hits, `${rel}: ${JSON.stringify(hits)}`).toEqual([])
    }
  })
})
