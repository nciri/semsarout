import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

// Surfaces already migrated to react-i18next — grows as sub-lots land.
// Heuristic below only runs against this list; everything else is still FR by design.
export const MIGRATED_FILES = [
  'src/surfaces/NotFound.jsx',
  'src/surfaces/web/WebLayout.jsx',
  'src/surfaces/web/Landing.jsx',
  'src/surfaces/web/SearchResults.jsx',
  'src/surfaces/web/ListingDetail.jsx',
  'src/surfaces/web/Connexion.jsx',
  'src/surfaces/web/MotDePasseOublie.jsx',
  'src/surfaces/web/ReinitialiserMotDePasse.jsx',
  'src/ds/nav/TopBar.jsx',
  'src/ds/nav/SidebarNav.jsx',
  'src/surfaces/app/AppLayout.jsx',
  'src/surfaces/partner/PartnerLayout.jsx',
  'src/ds/trust/VerifiedBadge.jsx',
  'src/ds/trust/CompatibilityRing.jsx',
  'src/ds/listing/PriceTag.jsx',
  'src/ds/listing/ListingCard.jsx',
  'src/surfaces/app/Dashboard.jsx',
  'src/surfaces/app/Messaging.jsx',
  'src/surfaces/partner/PartnerPortal.jsx',
  'src/surfaces/web/Inscription.jsx',
  'src/surfaces/web/Avis.jsx',
  'src/surfaces/app/Candidature.jsx',
  'src/surfaces/app/Candidatures.jsx',
  'src/surfaces/app/ValidationColocataire.jsx',
  'src/surfaces/app/Questionnaire.jsx',
  'src/surfaces/app/Paiement.jsx',
  'src/surfaces/app/Securite.jsx',
  'src/surfaces/app/Aide.jsx',
  'src/surfaces/backoffice/BackOffice.jsx',
  'src/surfaces/backoffice/AttributionChambres.jsx',
  'src/surfaces/app/PublierAnnonce.jsx',
  'src/surfaces/app/publier/StepBien.jsx',
  'src/surfaces/app/publier/StepLogement.jsx',
  'src/surfaces/app/publier/StepPrix.jsx',
  'src/surfaces/app/publier/StepDispoPhotos.jsx',
  'src/surfaces/partner/PartnerSection.jsx',
  'src/surfaces/partner/Affiliates.jsx',
  'src/surfaces/partner/Verifications.jsx',
  'src/surfaces/partner/ReservedOffers.jsx',
  'src/surfaces/partner/Grants.jsx',
  'src/surfaces/partner/Reporting.jsx',
  'src/surfaces/partner/Billing.jsx',
  'src/surfaces/partner/ApiWebhooks.jsx',
]

const FRENCH_ACCENTS = /[àâäéèêëîïôöùûüçœÀÂÄÉÈÊËÎÏÔÖÙÛÜÇŒ]/

function stripNonUiText(source) {
  return source
    // strip t('...') / t("...") / t(`...`) calls, including options object
    .replace(/\bt\(\s*(['"`])(?:(?!\1).)*\1[^)]*\)/g, '')
    // strip i18n comment markers and JS comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    // strip import/export statements (module specifiers, e.g. 'react-i18next')
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]*['"]\s*$/gm, '')
    // strip translation namespace/key string arguments left over, e.g. useTranslation('common')
    .replace(/useTranslation\([^)]*\)/g, '')
}

test('noHardcodedText: migrated files contain no raw French text outside t()', () => {
  const offenders = []

  for (const relPath of MIGRATED_FILES) {
    const absPath = path.join(REPO_ROOT, relPath)
    const source = readFileSync(absPath, 'utf8')
    const stripped = stripNonUiText(source)

    for (const line of stripped.split('\n')) {
      if (FRENCH_ACCENTS.test(line)) {
        offenders.push(`${relPath}: ${line.trim()}`)
      }
    }
  }

  assert.deepEqual(offenders, [], `found likely hardcoded French text outside t():\n${offenders.join('\n')}`)
})
