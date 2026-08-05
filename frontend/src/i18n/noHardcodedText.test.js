import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Heuristique read-only : repère un nœud de texte JSX (entre > et <, sans { } < >)
// contenant du français (accent OU mot FR courant) — signe d'une chaîne non
// enveloppée dans t(). Le texte dans {t('...')} est ignoré (contient des accolades).
const FR_HINT = /[àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]|\b(Accueil|Rechercher|Aucun|Aucune|Voir|Envoyer|Retour|Connexion|Pr[eé]c[eé]dent|Suivant|Ajouter|Modifier|Supprimer|Enregistrer|Annuler|Fermer|Chargement|Bienvenue|Notre|Nos|Votre|Vos|D[eé]couvrir|Contactez|Comparer|Biens|Page|introuvable|Copier|Copi[eé])\b/

export function findHardcodedText(source) {
  const hits = []
  // 1) Nœuds de texte JSX entre > et < (hors accolades).
  const textRe = />([^<>{}]+)</g
  let m
  while ((m = textRe.exec(source)) !== null) {
    const text = m[1].replace(/\s+/g, ' ').trim()
    if (text && FR_HINT.test(text)) hits.push(text)
  }
  // 2) Attributs statiques title/placeholder/aria-label="..." (dynamiques ={t()} ignorés).
  const attrRe = /\b(?:title|placeholder|aria-label)="([^"]*)"/g
  while ((m = attrRe.exec(source)) !== null) {
    const val = m[1].replace(/\s+/g, ' ').trim()
    if (val && FR_HINT.test(val)) hits.push(val)
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
  'src/pages/CompareProperties.jsx',
  'src/pages/MortgageSimulator.jsx',
  'src/pages/Home.jsx',
  'src/pages/Contact.jsx',
  'src/pages/AgencyList.jsx',
  'src/pages/AgencyDetail.jsx',
  'src/pages/ProgramList.jsx',
  'src/pages/Checkout.jsx',
  'src/pages/AgencyPricing.jsx',
  'src/pages/PropertyList.jsx',
  'src/pages/ProgramDetail.jsx',
  'src/pages/Services.jsx',
  'src/pages/PropertyDetail.jsx',
  'src/pages/SellProperty.jsx',
  'src/components/layout/Header.jsx',
  'src/components/layout/Footer.jsx',
  'src/components/admin/ImpersonationBanner.jsx',
  'src/components/common/PropertyCard.jsx',
  'src/components/search/AdvancedSearch.jsx',
  'src/components/common/SearchForm.jsx',
  'src/components/common/SearchableSelect.jsx',
  'src/components/search/MultiSelectDropdown.jsx',
  'src/components/common/BookVisitWidget.jsx',
  'src/components/common/LotPlanViewer.jsx',
  'src/components/common/PriceGauge.jsx',
  'src/components/common/PhotoLightbox.jsx',
  'src/components/dashboard/widgets/index.jsx',
  'src/components/backoffice/SignaturePanel.jsx',
  'src/components/backoffice/ui.jsx',
]

describe('noHardcodedText (garde-fou heuristique)', () => {
  it('détecte le français JSX non enveloppé', () => {
    expect(findHardcodedText('<div>Page introuvable</div>')).toEqual(['Page introuvable'])
  })

  it("ignore le texte enveloppé dans t()", () => {
    expect(findHardcodedText("<div>{t('public:notFound.title')}</div>")).toEqual([])
  })

  it('détecte le français dans un attribut statique', () => {
    expect(findHardcodedText('<input placeholder="Rechercher" />')).toEqual(['Rechercher'])
  })

  it('ignore un attribut dynamique {t()}', () => {
    expect(findHardcodedText("<input placeholder={t('public:x.search')} />")).toEqual([])
  })

  it('les fichiers migrés ne contiennent pas de français JSX non traduit', () => {
    for (const rel of MIGRATED_FILES) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
      const hits = findHardcodedText(src)
      expect(hits, `${rel}: ${JSON.stringify(hits)}`).toEqual([])
    }
  })
})
