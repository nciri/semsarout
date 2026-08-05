# i18n Phase 1 — Lot 2b (public, pages moyennes + garde-fou enrichi) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir le garde-fou anti-texte-codé-en-dur (attributs) + combler le test manquant PaymentGateway, puis rendre bilingues FR/AR les 5 pages publiques moyennes (Home, Contact, AgencyList, AgencyDetail, ProgramList).

**Architecture:** Extraction i18n suivant les patterns Phase 0/auth/lot2a (react-i18next, `t('public:section.key')`, brouillon AR immédiat, classes Tailwind logiques, `DirIcon`, garde-fou `noHardcodedText` + parité). Le garde-fou gagne la détection des attributs statiques `title/placeholder/aria-label`.

**Tech Stack:** react-i18next, Vitest + @testing-library/react.

## Global Constraints

- Langues : `fr` (défaut+fallback) et `ar`. Réutiliser `common:*`. Namespace `public` déjà en place (sections `notFound/payment/checkoutConfirmation/about/compare/mortgage`).
- Conventions : `useTranslation(['public','common'])`, clés `t('public:section.key')`, utilitaires Tailwind logiques natifs (`ms/me/ps/pe/start/end/text-start/text-end/rounded-s/rounded-e/border-s/border-e`), AUCUN plugin RTL, `DirIcon` pour icônes horizontalement directionnelles.
- fr/ar `public.json` **structurellement identiques** (parité). Brouillon AR = MSA formel.
- **NE PAS réintroduire i18next-parser.** Garde-fou = `src/i18n/noHardcodedText.test.js`.
- Chaque page migrée est ajoutée à `MIGRATED_FILES`. Le garde-fou doit rester vert : s'il signale une chaîne (texte OU attribut), c'est un oubli à corriger.
- Migration incrémentale : `npm test` + `npm run build` verts à chaque commit ; données API/props restent FR figé.
- Hors périmètre (lot 2c) : PropertyDetail, SellProperty, Services, ProgramDetail, PropertyList, AgencyPricing, Checkout.
- Répertoire : `frontend/`. Branche : `feature/i18n-arabe`.

---

## File Structure

- Modify: `frontend/src/i18n/noHardcodedText.test.js` (scanner les attributs + tests unitaires).
- Create: `frontend/src/pages/PaymentGateway.test.jsx`.
- Modify (pages) : `frontend/src/pages/{Home,Contact,AgencyList,AgencyDetail,ProgramList}.jsx` + `frontend/src/locales/{fr,ar}/public.json` (sections `home/contact/agencyList/agencyDetail/programList`).
- Create (tests) : `frontend/src/pages/{Home,Contact,AgencyList,AgencyDetail,ProgramList}.test.jsx`.

---

## Task 1: Garde-fou enrichi (attributs) + test PaymentGateway

**Files:**
- Modify: `frontend/src/i18n/noHardcodedText.test.js`
- Create: `frontend/src/pages/PaymentGateway.test.jsx`

**Interfaces:**
- Produces: `findHardcodedText(source)` détecte désormais AUSSI le français dans les attributs statiques `title="..."` / `placeholder="..."` / `aria-label="..."` (les attributs dynamiques `={t(...)}` ne matchent pas — pas de guillemets).

- [ ] **Step 1: Remplacer `findHardcodedText` (ajout du scan d'attributs) + tests unitaires**

Modify `frontend/src/i18n/noHardcodedText.test.js` — remplacer la fonction `findHardcodedText` par :

```js
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
```

Ajouter deux tests unitaires dans le `describe`, après le test « ignore le texte enveloppé dans t() » :

```js
  it('détecte le français dans un attribut statique', () => {
    expect(findHardcodedText('<input placeholder="Rechercher" />')).toEqual(['Rechercher'])
  })

  it('ignore un attribut dynamique {t()}', () => {
    expect(findHardcodedText("<input placeholder={t('public:x.search')} />")).toEqual([])
  })
```

- [ ] **Step 2: Lancer le garde-fou — vérifier qu'il reste vert sur les 7 pages déjà migrées**

Run: `cd frontend && npm test -- noHardcodedText`
Expected: PASS. **Si** le nouveau scan d'attributs signale un attribut français oublié dans une page déjà migrée, le corriger dans cette page (le migrer vers `t('public:...')`, ajouter la clé fr/ar) avant de continuer, puis relancer.

- [ ] **Step 3: Écrire le test de rendu PaymentGateway**

Create `frontend/src/pages/PaymentGateway.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import PaymentGateway from './PaymentGateway'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/paiement?ref=ABC&amount=1000']}>
      <PaymentGateway />
    </MemoryRouter>,
  )
}

describe('PaymentGateway i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend l\'avis démo en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:payment.demoNotice'))).toBeInTheDocument()
  })
  it('rend l\'avis démo en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:payment.demoNotice'))).toBeInTheDocument()
  })
})
```

(Si la page nécessite d'autres query params pour afficher l'avis démo, inspecter le composant et ajuster `initialEntries`. `demoNotice` est choisi car unique — `payment.title` et `payment.confirmButton` partagent le même texte FR.)

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- PaymentGateway noHardcodedText`
Expected: PASS.

- [ ] **Step 5: Suite + build**

Run: `cd frontend && npm test && npm run build`  → verts.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/i18n/noHardcodedText.test.js frontend/src/pages/PaymentGateway.test.jsx
git commit -m "test(i18n): garde-fou noHardcodedText scanne les attributs + test rendu PaymentGateway"
```

---

## Recette commune aux Tasks 2–6 (migration d'une page publique moyenne)

1. `import { useTranslation } from 'react-i18next'` ; `const { t } = useTranslation(['public', 'common'])`.
2. Remplacer **chaque** chaîne FR visible (texte JSX, `placeholder`, `label`, `title`, `aria-label`, bouton, options `<select>`) par `t('public:<page>.<key>')`. Réutiliser `common:*` pour un message déjà présent (ex. `common:errors.generic`, `common:actions.search`).
3. Ajouter chaque nouvelle clé dans `frontend/src/locales/fr/public.json` (FR verbatim) ET `frontend/src/locales/ar/public.json` (**brouillon AR MSA**), fichiers **structurellement identiques**. Insérer la nouvelle section sans toucher aux sections existantes.
4. **Interpolation** i18next pour les textes à variable (`"… {{count}} …"` + `t(key, { count })`), plutôt que concaténer.
5. **RTL** : classes directionnelles physiques → logiques ; icônes horizontalement directionnelles (`FiArrowRight/Left`, chevrons latéraux) via `DirIcon` (`import DirIcon from '../../components/common/DirIcon'`). Icônes non directionnelles inchangées.
6. Laisser en FR les chaînes de **données** (props/API : noms d'agences, titres de biens, descriptions renvoyées par le backend).
7. **Ajouter le chemin de la page à `MIGRATED_FILES`** dans `src/i18n/noHardcodedText.test.js`. Le garde-fou (texte + attributs) doit rester vert.

**NE PAS restructurer la logique de rendu du composant** — c'est une migration de chaînes. Si un titre ne s'affiche qu'après un état (chargement/données), adapter le TEST (`QueryClientProvider`, `initialEntries`, `findByText`) plutôt que le composant.

Test de rendu (par page) : monter la page avec les providers requis (`MemoryRouter` + `QueryClientProvider` car react-query ; `initialEntries` pour les params) ; ancrer l'assertion sur `i18n.t('public:<page>.<titleKey>')` en FR puis en AR (valeurs FR ≠ AR). Le titre choisi doit être une chaîne **statique** (pas une donnée) et **unique** dans le rendu.

---

## Task 2: Migrer `Home.jsx`

**Files:** Modify `frontend/src/pages/Home.jsx` ; Modify `frontend/src/i18n/noHardcodedText.test.js` ; Test `frontend/src/pages/Home.test.jsx`.

Section `public:home.*`. Migrer hero (titre/sous-titre/CTA), les titres de sections, libellés et boutons. La page utilise react-query (biens en vedette) — les titres statiques ne dépendent pas des données. Choisir un titre de section statique **unique** comme `public:home.<titleKey>` pour le test.

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/Home.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import Home from './Home'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Home /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Home i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un titre statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:home.heroTitle'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:home.heroTitle'))).toBeInTheDocument()
  })
})
```

(Clé `public:home.heroTitle` = titre principal réel de la page en FR + brouillon AR distinct. Si le hero contient plusieurs nœuds/retours à la ligne rendant `findByText` ambigu, choisir une autre chaîne statique unique — ex. un titre de section — et adapter la clé.)

- [ ] **Step 2: Lancer — doit échouer** — `cd frontend && npm test -- Home`  → FAIL.
- [ ] **Step 3: Migrer `Home.jsx`** (recette). Ajouter `'src/pages/Home.jsx'` à `MIGRATED_FILES`.
- [ ] **Step 4: Lancer — doit passer** — `cd frontend && npm test -- Home`  → PASS.
- [ ] **Step 5: Suite + build** — `cd frontend && npm test && npm run build`  → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Home.jsx frontend/src/pages/Home.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page Home bilingue (public:home)"
```

---

## Task 3: Migrer `Contact.jsx`

**Files:** Modify `frontend/src/pages/Contact.jsx` ; Modify `frontend/src/i18n/noHardcodedText.test.js` ; Test `frontend/src/pages/Contact.test.jsx`.

Section `public:contact.*`. Formulaire de contact : migrer titre, tous les labels/placeholders, boutons, textes d'aide (« Suivez votre demande en ligne »…), messages de succès/erreur (réutiliser `common:errors.generic` si pertinent). La page utilise `useSearchParams`.

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/Contact.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import Contact from './Contact'

function renderPage() {
  return render(<MemoryRouter><Contact /></MemoryRouter>)
}

describe('Contact i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:contact.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:contact.title'))).toBeInTheDocument()
  })
})
```

(Clé `public:contact.title` = titre principal statique réel + brouillon AR distinct, unique dans le rendu.)

- [ ] **Step 2: Lancer — doit échouer** — `cd frontend && npm test -- Contact`  → FAIL.
- [ ] **Step 3: Migrer `Contact.jsx`** (recette). Ajouter le fichier à `MIGRATED_FILES`.
- [ ] **Step 4: Lancer — doit passer** — `cd frontend && npm test -- Contact`  → PASS.
- [ ] **Step 5: Suite + build** — `cd frontend && npm test && npm run build`  → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Contact.jsx frontend/src/pages/Contact.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page Contact bilingue (public:contact)"
```

---

## Task 4: Migrer `AgencyList.jsx`

**Files:** Modify `frontend/src/pages/AgencyList.jsx` ; Modify `frontend/src/i18n/noHardcodedText.test.js` ; Test `frontend/src/pages/AgencyList.test.jsx`.

Section `public:agencyList.*`. Page liste d'agences : titre, recherche/filtres (labels + placeholders), tri, états vide/chargement, pagination. react-query + `useSearchParams`. Les noms/descriptions d'agences sont des **données** (restent FR).

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/AgencyList.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import AgencyList from './AgencyList'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AgencyList /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AgencyList i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:agencyList.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:agencyList.title'))).toBeInTheDocument()
  })
})
```

(Clé `public:agencyList.title` = titre statique réel + brouillon AR, unique.)

- [ ] **Step 2: Lancer — doit échouer** — `cd frontend && npm test -- AgencyList`  → FAIL.
- [ ] **Step 3: Migrer `AgencyList.jsx`** (recette). Ajouter le fichier à `MIGRATED_FILES`.
- [ ] **Step 4: Lancer — doit passer** — `cd frontend && npm test -- AgencyList`  → PASS.
- [ ] **Step 5: Suite + build** — `cd frontend && npm test && npm run build`  → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AgencyList.jsx frontend/src/pages/AgencyList.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page AgencyList bilingue (public:agencyList)"
```

---

## Task 5: Migrer `AgencyDetail.jsx`

**Files:** Modify `frontend/src/pages/AgencyDetail.jsx` ; Modify `frontend/src/i18n/noHardcodedText.test.js` ; Test `frontend/src/pages/AgencyDetail.test.jsx`.

Section `public:agencyDetail.*`. Page détail agence : libellés statiques (onglets, sections « Biens de l'agence », « Contacter », compteurs, états vide/chargement). Le **nom/description de l'agence** et ses biens sont des **données** (restent FR). `useParams(slug)` + react-query.

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/AgencyDetail.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import AgencyDetail from './AgencyDetail'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/agences/demo']}>
        <Routes>
          <Route path="/agences/:slug" element={<AgencyDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AgencyDetail i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un libellé statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:agencyDetail.propertiesTitle'))).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:agencyDetail.propertiesTitle'))).toBeInTheDocument()
  })
})
```

(Clé `public:agencyDetail.propertiesTitle` = un libellé statique réel de la page qui s'affiche même sans données — ex. le titre de la section des biens. Si ce libellé n'apparaît qu'avec des données, choisir un autre libellé statique toujours rendu — ex. état de chargement/vide — et adapter la clé.)

- [ ] **Step 2: Lancer — doit échouer** — `cd frontend && npm test -- AgencyDetail`  → FAIL.
- [ ] **Step 3: Migrer `AgencyDetail.jsx`** (recette). Ajouter le fichier à `MIGRATED_FILES`.
- [ ] **Step 4: Lancer — doit passer** — `cd frontend && npm test -- AgencyDetail`  → PASS.
- [ ] **Step 5: Suite + build** — `cd frontend && npm test && npm run build`  → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AgencyDetail.jsx frontend/src/pages/AgencyDetail.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page AgencyDetail bilingue (public:agencyDetail)"
```

---

## Task 6: Migrer `ProgramList.jsx`

**Files:** Modify `frontend/src/pages/ProgramList.jsx` ; Modify `frontend/src/i18n/noHardcodedText.test.js` ; Test `frontend/src/pages/ProgramList.test.jsx`.

Section `public:programList.*`. Page liste des programmes neufs : titre/sous-titre, filtres (labels + placeholders + options), tri, états vide/chargement. react-query. Les noms de programmes sont des **données** (restent FR).

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/ProgramList.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import ProgramList from './ProgramList'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ProgramList /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProgramList i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:programList.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:programList.title'))).toBeInTheDocument()
  })
})
```

(Clé `public:programList.title` = titre statique réel + brouillon AR, unique.)

- [ ] **Step 2: Lancer — doit échouer** — `cd frontend && npm test -- ProgramList`  → FAIL.
- [ ] **Step 3: Migrer `ProgramList.jsx`** (recette). Ajouter le fichier à `MIGRATED_FILES`.
- [ ] **Step 4: Lancer — doit passer** — `cd frontend && npm test -- ProgramList`  → PASS.
- [ ] **Step 5: Suite complète + build** — `cd frontend && npm test && npm run build`  → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProgramList.jsx frontend/src/pages/ProgramList.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page ProgramList bilingue (public:programList)"
```

---

## Validation finale du lot 2b

- [ ] `cd frontend && npm test` → tous verts (parité, garde-fou texte+attributs sur toutes les pages migrées, tests de rendu).
- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] `MIGRATED_FILES` inclut les 12 pages publiques migrées (7 du lot 2a + 5 de ce lot) ; le garde-fou (texte + attributs) ne signale rien.
- [ ] Manuel : `npm run dev`, ouvrir `/`, `/contact`, `/agences`, une fiche agence, `/programmes` → bascule FR↔AR OK, RTL correct.
