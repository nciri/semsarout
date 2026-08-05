# i18n Phase 1 — Lot 2a (public, petites pages + infra) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer le namespace `public` + un garde-fou anti-texte-codé-en-dur non destructif, et rendre bilingues FR/AR les 7 petites pages publiques (≤ 137 lignes).

**Architecture:** Extraction i18n suivant les patterns Phase 0/auth (react-i18next, `t('public:section.key')`, brouillon AR immédiat, classes Tailwind logiques, `DirIcon`). Garde-fou = test Vitest read-only qui repère le texte JSX français non enveloppé dans `t()` sur une liste de fichiers migrés maintenue à la main.

**Tech Stack:** react-i18next, Vitest + @testing-library/react.

## Global Constraints

- Langues : `fr` (défaut+fallback) et `ar`. Réutiliser `common:*` pour les messages génériques déjà présents. Créer `public`.
- Conventions Phase 0/auth : `useTranslation(['public','common'])`, clés `t('public:section.key')`, utilitaires Tailwind logiques natifs (`ms/me/ps/pe/start/end/text-start/text-end/rounded-s/rounded-e/border-s/border-e`), AUCUN plugin RTL, `DirIcon` pour icônes horizontalement directionnelles, icônes non directionnelles inchangées.
- fr/ar `public.json` **structurellement identiques** (test de parité). Brouillon AR = arabe standard (MSA), registre formel.
- **NE PAS réintroduire i18next-parser** (retiré car destructif). Le garde-fou de ce lot est le test `noHardcodedText`.
- Migration incrémentale : `npm test` + `npm run build` verts à chaque commit ; chaînes de **données** (API/props, ex. sections de `LegalPage`) restent FR figé.
- Répertoire : `frontend/`. Branche : `feature/i18n-arabe`.
- Hors périmètre de ce lot : les grosses pages (Home, PropertyList, PropertyDetail, SellProperty, Services, Program*, Agency*, Checkout, Contact) — lots 2b/2c.

---

## File Structure

- Create: `frontend/src/locales/fr/public.json`, `frontend/src/locales/ar/public.json`.
- Modify: `frontend/src/i18n/index.js` (enregistrer `public`), `frontend/src/i18n/keyParity.test.js` (couvrir `public`).
- Create: `frontend/src/i18n/noHardcodedText.test.js` (garde-fou + fonction `findHardcodedText`).
- Modify (pages) : `frontend/src/pages/{NotFound,LegalPage,PaymentGateway,CheckoutConfirmation,About,CompareProperties,MortgageSimulator}.jsx`.
- Create (tests) : `frontend/src/pages/{About,CompareProperties,MortgageSimulator}.test.jsx` (+ tests groupés pour les tiny).

---

## Task 1: Namespace `public` + garde-fou `noHardcodedText`

**Files:**
- Create: `frontend/src/locales/fr/public.json`, `frontend/src/locales/ar/public.json`
- Modify: `frontend/src/i18n/index.js`, `frontend/src/i18n/keyParity.test.js`
- Create: `frontend/src/i18n/noHardcodedText.test.js`

**Interfaces:**
- Produces: namespace `public` chargé (`t('public:...')`) ; fonction `findHardcodedText(source) -> string[]` et une liste `MIGRATED_FILES` (au départ vide) qu'on complète à chaque page migrée.

- [ ] **Step 1: Créer `fr/public.json` et `ar/public.json` vides**

Create `frontend/src/locales/fr/public.json` :

```json
{}
```

Create `frontend/src/locales/ar/public.json` :

```json
{}
```

- [ ] **Step 2: Enregistrer `public` dans l'init**

Modify `frontend/src/i18n/index.js` :
- Imports (après ceux de `auth`) :

```js
import frPublic from '../locales/fr/public.json'
import arPublic from '../locales/ar/public.json'
```

- `resources` :

```js
const resources = {
  fr: { common: frCommon, backoffice: frBackoffice, auth: frAuth, public: frPublic },
  ar: { common: arCommon, backoffice: arBackoffice, auth: arAuth, public: arPublic },
}
```

- `ns` : `ns: ['common', 'backoffice', 'auth', 'public'],`

- [ ] **Step 3: Étendre la parité au namespace `public`**

Modify `frontend/src/i18n/keyParity.test.js` :
- Imports (après ceux de `auth`) :

```js
import frPublic from '../locales/fr/public.json'
import arPublic from '../locales/ar/public.json'
```

- Ligne dans le `it.each` (après `auth`) :

```js
    ['public', frPublic, arPublic],
```

- [ ] **Step 4: Écrire le garde-fou `noHardcodedText.test.js`**

Create `frontend/src/i18n/noHardcodedText.test.js` :

```js
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
const MIGRATED_FILES = []

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
```

- [ ] **Step 5: Lancer parité + garde-fou + build**

Run: `cd frontend && npm test -- keyParity noHardcodedText`
Expected: PASS (parité common/backoffice/auth/public verte ; détecteur unitaire OK ; liste vide → boucle no-op).
Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json frontend/src/i18n/index.js frontend/src/i18n/keyParity.test.js frontend/src/i18n/noHardcodedText.test.js
git commit -m "feat(i18n): namespace public + garde-fou noHardcodedText (heuristique read-only)"
```

---

## Recette commune aux Tasks 2–6 (migration d'une page publique)

1. `import { useTranslation } from 'react-i18next'` ; `const { t } = useTranslation(['public', 'common'])`.
2. Remplacer **chaque** chaîne FR visible (texte, `placeholder`, `label`, `title`, `aria-label`, bouton, options `<select>`) par `t('public:<section>.<key>')`. Réutiliser `common:*` pour un message déjà présent en commun (ex. `common:errors.generic`, `common:actions.*`).
3. Ajouter chaque nouvelle clé dans `frontend/src/locales/fr/public.json` (FR verbatim) ET `frontend/src/locales/ar/public.json` (**brouillon AR MSA**), fichiers **structurellement identiques** (parité).
4. **RTL** : classes directionnelles physiques → logiques ; icônes horizontalement directionnelles (`FiArrowRight/Left`, chevrons latéraux) via `DirIcon` (`import DirIcon from '../../components/common/DirIcon'`).
5. Laisser en FR les chaînes de **données** (props/API — ex. `section.heading`/`section.body` de `LegalPage`).
6. **Ajouter le chemin du fichier migré à `MIGRATED_FILES`** dans `src/i18n/noHardcodedText.test.js` (ex. `'src/pages/About.jsx'`). Le garde-fou doit rester vert : s'il signale une chaîne, c'est une chaîne oubliée à migrer (ou un faux positif de donnée — dans ce cas déplacer la donnée hors JSX text ou justifier).

Test de rendu (par page) : monter la page (providers requis : `MemoryRouter`, `QueryClientProvider` si react-query, `initialEntries` avec les query params requis si la page en dépend) et vérifier un titre/heading **statique** représentatif en FR puis en AR après `i18n.changeLanguage('ar')` (`findByText` si un état de chargement asynchrone précède).

---

## Task 2: Migrer `NotFound.jsx` + `LegalPage.jsx`

**Files:**
- Modify: `frontend/src/pages/NotFound.jsx`, `frontend/src/pages/LegalPage.jsx`
- Modify: `frontend/src/i18n/noHardcodedText.test.js` (ajouter les 2 fichiers à `MIGRATED_FILES`)
- Test: `frontend/src/pages/NotFound.test.jsx`

Sections : `public:notFound.*` et `public:legal.*`. Pour `LegalPage`, seules les chaînes **statiques** (titre de repli, libellés fixes) sont migrées ; le contenu des `sections` (heading/body) vient des données et reste tel quel.

- [ ] **Step 1: Test de rendu FR/AR pour NotFound**

Create `frontend/src/pages/NotFound.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import NotFound from './NotFound'

function renderPage() {
  return render(<MemoryRouter><NotFound /></MemoryRouter>)
}

describe('NotFound i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('الصفحة غير موجودة')).toBeInTheDocument()
  })
})
```

(Si le libellé exact de la page diffère de « Page introuvable », adapter l'assertion FR à la chaîne réelle du titre principal et lui associer la même clé + valeur AR `"الصفحة غير موجودة"`.)

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- NotFound`  → FAIL (AR introuvable).

- [ ] **Step 3: Migrer `NotFound.jsx` et `LegalPage.jsx`** (recette). Clé du titre `public:notFound.title` FR (libellé réel de la page) / AR `"الصفحة غير موجودة"`. Ajouter `'src/pages/NotFound.jsx'` et `'src/pages/LegalPage.jsx'` à `MIGRATED_FILES`.

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- NotFound`  → PASS.

- [ ] **Step 5: Suite complète + build**

Run: `cd frontend && npm test`  → tout vert (parité + garde-fou inclus).
Run: `cd frontend && npm run build`  → `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/NotFound.jsx frontend/src/pages/LegalPage.jsx frontend/src/pages/NotFound.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): pages NotFound + LegalPage bilingues (public:notFound/legal)"
```

---

## Task 3: Migrer `PaymentGateway.jsx` + `CheckoutConfirmation.jsx`

**Files:**
- Modify: `frontend/src/pages/PaymentGateway.jsx`, `frontend/src/pages/CheckoutConfirmation.jsx`
- Modify: `frontend/src/i18n/noHardcodedText.test.js` (ajouter les 2 fichiers)
- Test: `frontend/src/pages/CheckoutConfirmation.test.jsx`

Sections : `public:payment.*` et `public:checkoutConfirmation.*`. Réutiliser `common:actions.*` si pertinent. `CheckoutConfirmation` : migrer `Copier la référence` (title) et `Copié !` → `public:checkoutConfirmation.*`.

- [ ] **Step 1: Test de rendu FR/AR pour CheckoutConfirmation**

Create `frontend/src/pages/CheckoutConfirmation.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import CheckoutConfirmation from './CheckoutConfirmation'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/paiement/confirmation?status=success&ref=ABC']}>
      <CheckoutConfirmation />
    </MemoryRouter>,
  )
}

describe('CheckoutConfirmation i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre succès en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkoutConfirmation.successTitle'))).toBeInTheDocument()
  })
  it('rend le titre succès en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkoutConfirmation.successTitle'))).toBeInTheDocument()
  })
})
```

(Le test s'appuie sur la clé `public:checkoutConfirmation.successTitle` que la migration doit créer, avec une valeur FR distincte de la valeur AR — vérifier que la page atteint bien l'état « succès » avec ces query params ; sinon adapter `initialEntries`.)

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- CheckoutConfirmation`  → FAIL (clé inexistante → texte brut).

- [ ] **Step 3: Migrer les 2 pages** (recette). Ajouter les 2 fichiers à `MIGRATED_FILES`.

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- CheckoutConfirmation`  → PASS.

- [ ] **Step 5: Suite + build**

Run: `cd frontend && npm test && npm run build`  → verts.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PaymentGateway.jsx frontend/src/pages/CheckoutConfirmation.jsx frontend/src/pages/CheckoutConfirmation.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): pages PaymentGateway + CheckoutConfirmation bilingues"
```

---

## Task 4: Migrer `About.jsx`

**Files:**
- Modify: `frontend/src/pages/About.jsx`
- Modify: `frontend/src/i18n/noHardcodedText.test.js`
- Test: `frontend/src/pages/About.test.jsx`

Section `public:about.*`. Migrer toute la copie marketing (titre, `Notre mission`, sections, boutons/liens). Représentatif : `Notre mission` → `public:about.missionTitle` FR `"Notre mission"` / AR `"مهمتنا"`.

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/About.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import About from './About'

function renderPage() {
  return render(<MemoryRouter><About /></MemoryRouter>)
}

describe('About i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend "Notre mission" en FR', async () => {
    renderPage()
    expect(await screen.findByText('Notre mission')).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('مهمتنا')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — doit échouer** — `cd frontend && npm test -- About`  → FAIL.
- [ ] **Step 3: Migrer `About.jsx`** (recette). `public:about.missionTitle` FR `"Notre mission"` / AR `"مهمتنا"`. Ajouter `'src/pages/About.jsx'` à `MIGRATED_FILES`.
- [ ] **Step 4: Lancer — doit passer** — `cd frontend && npm test -- About`  → PASS.
- [ ] **Step 5: Suite + build** — `cd frontend && npm test && npm run build`  → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/About.jsx frontend/src/pages/About.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page About bilingue (public:about)"
```

---

## Task 5: Migrer `CompareProperties.jsx`

**Files:**
- Modify: `frontend/src/pages/CompareProperties.jsx`
- Modify: `frontend/src/i18n/noHardcodedText.test.js`
- Test: `frontend/src/pages/CompareProperties.test.jsx`

Section `public:compare.*`. Représentatif : `Comparer les biens` → `public:compare.title` FR `"Comparer les biens"` / AR `"مقارنة العقارات"`. La page utilise react-query (état de chargement) → wrapper `QueryClientProvider` + `findByText`.

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/CompareProperties.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import CompareProperties from './CompareProperties'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><CompareProperties /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CompareProperties i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText('Comparer les biens')).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('مقارنة العقارات')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — doit échouer** — `cd frontend && npm test -- CompareProperties`  → FAIL.
- [ ] **Step 3: Migrer `CompareProperties.jsx`** (recette). `public:compare.title` FR `"Comparer les biens"` / AR `"مقارنة العقارات"`. Ajouter le fichier à `MIGRATED_FILES`.
- [ ] **Step 4: Lancer — doit passer** — `cd frontend && npm test -- CompareProperties`  → PASS.
- [ ] **Step 5: Suite + build** — `cd frontend && npm test && npm run build`  → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CompareProperties.jsx frontend/src/pages/CompareProperties.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page CompareProperties bilingue (public:compare)"
```

---

## Task 6: Migrer `MortgageSimulator.jsx`

**Files:**
- Modify: `frontend/src/pages/MortgageSimulator.jsx`
- Modify: `frontend/src/i18n/noHardcodedText.test.js`
- Test: `frontend/src/pages/MortgageSimulator.test.jsx`

Section `public:mortgage.*`. Migrer le titre, les libellés du formulaire (montant, durée, taux…), les libellés de résultats et boutons. Représentatif : le titre principal `<h1>` → `public:mortgage.title` (utiliser le libellé réel FR de la page + son brouillon AR dans l'assertion).

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/MortgageSimulator.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import MortgageSimulator from './MortgageSimulator'

function renderPage() {
  return render(<MemoryRouter><MortgageSimulator /></MemoryRouter>)
}

describe('MortgageSimulator i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:mortgage.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:mortgage.title'))).toBeInTheDocument()
  })
})
```

(Le test lit la valeur via `i18n.t` : il vérifie que le `<h1>` affiche bien la valeur de `public:mortgage.title` dans la langue active — FR puis AR. S'assurer que la valeur FR ≠ valeur AR.)

- [ ] **Step 2: Lancer — doit échouer** — `cd frontend && npm test -- MortgageSimulator`  → FAIL.
- [ ] **Step 3: Migrer `MortgageSimulator.jsx`** (recette). Ajouter le fichier à `MIGRATED_FILES`.
- [ ] **Step 4: Lancer — doit passer** — `cd frontend && npm test -- MortgageSimulator`  → PASS.
- [ ] **Step 5: Suite + build** — `cd frontend && npm test && npm run build`  → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MortgageSimulator.jsx frontend/src/pages/MortgageSimulator.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page MortgageSimulator bilingue (public:mortgage)"
```

---

## Validation finale du lot 2a

- [ ] `cd frontend && npm test` → tous verts (parité common/backoffice/auth/public, garde-fou noHardcodedText sur 7 pages, tests de rendu).
- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] `MIGRATED_FILES` liste bien les 7 pages ; le garde-fou ne signale aucune chaîne.
- [ ] Manuel : `npm run dev`, ouvrir `/a-propos`, `/comparer`, `/simulateur-credit`, une page 404 → bascule FR↔AR OK, RTL correct.
