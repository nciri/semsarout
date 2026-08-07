# i18n Phase 1 — Lot 2c (public, grosses pages) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pour implémenter tâche par tâche. Les étapes utilisent la syntaxe checkbox (`- [ ]`).

**Goal:** Rendre bilingues FR/AR les 7 grosses pages publiques restantes de la Phase 1 : Checkout, AgencyPricing, PropertyList, ProgramDetail, Services, PropertyDetail, SellProperty.

**Architecture:** Extraction i18n suivant exactement les patterns Phase 0/auth/lot2a/lot2b (react-i18next, `t('public:section.key')`, brouillon AR immédiat MSA, classes Tailwind logiques, `DirIcon`, garde-fou `noHardcodedText` texte+attributs + parité). Une page = une tâche = un commit. Aucun changement backend.

**Tech Stack:** react-i18next, Vitest + @testing-library/react.

## Global Constraints

- Langues : `fr` (défaut+fallback) et `ar`. Réutiliser `common:*` (`actions/errors/validation/...`). Namespace `public` déjà en place (sections des lots 2a/2b).
- Conventions : `useTranslation(['public','common'])`, clés `t('public:section.key')`, utilitaires Tailwind **logiques** natifs (`ms/me/ps/pe/start/end/text-start/text-end/rounded-s/rounded-e/border-s/border-e`), AUCUN plugin RTL, `DirIcon` (`import DirIcon from '../components/common/DirIcon'`) pour les icônes horizontalement directionnelles (`FiArrowRight/Left`, chevrons latéraux) ; icônes non directionnelles inchangées.
- fr/ar `public.json` **structurellement identiques** (parité — test `keyParity` doit rester vert). Brouillon AR = MSA formel. Insérer chaque nouvelle section sans toucher aux sections existantes.
- **Interpolation** i18next pour tout texte à variable (`"… {{count}} …"` + `t(key, { count })`), jamais de concaténation.
- **NE PAS réintroduire i18next-parser.** Garde-fou = `src/i18n/noHardcodedText.test.js` (scanne déjà texte JSX + attributs `title/placeholder/aria-label`). Chaque page migrée est ajoutée à `MIGRATED_FILES` ; le garde-fou doit rester vert (une chaîne signalée = un oubli à migrer).
- Les chaînes de **données** (props/API : titres de biens, noms d'agences, descriptions renvoyées par le backend) restent en FR.
- **NE PAS restructurer la logique de rendu** — migration de chaînes uniquement. Si un libellé n'apparaît qu'après un état (chargement/données), adapter le TEST (providers, `initialEntries`, `findByText`) plutôt que le composant.
- `npm test` + `npm run build` verts à chaque commit.
- Répertoire : `frontend/`. Branche : `feature/i18n-phase1-lot2c`.

---

## File Structure

Par page `<Page>` (dans `frontend/src/pages/`) :
- Modify: `frontend/src/pages/<Page>.jsx` (extraction des chaînes).
- Modify: `frontend/src/locales/fr/public.json` + `frontend/src/locales/ar/public.json` (nouvelle section `public:<section>`).
- Modify: `frontend/src/i18n/noHardcodedText.test.js` (ajouter `'src/pages/<Page>.jsx'` à `MIGRATED_FILES`).
- Create: `frontend/src/pages/<Page>.test.jsx` (rendu FR→AR).

Pages, routes et providers de test (identifiés depuis `src/App.jsx`) :

| Page | Lignes | Route | Hooks | Providers de test |
|---|---|---|---|---|
| Checkout | 415 | `/panier` (index) | `useSearchParams` | `MemoryRouter` (+ inspecter si contexte panier requis) |
| AgencyPricing | 455 | `/agences/tarifs` | `useQuery` | `QueryClientProvider` + `MemoryRouter` |
| PropertyList | 497 | `/annonces` | `useQuery`, `useSearchParams` | `QueryClientProvider` + `MemoryRouter` |
| ProgramDetail | 624 | `/programmes/:slug` | `useParams`, `useQuery` | `QueryClientProvider` + `MemoryRouter` + `Routes/Route` (`/programmes/demo`) |
| Services | 752 | `/nos-services`, `/nos-services/:service` | — | `MemoryRouter` (+ `Routes/Route` si la variante `:service` est testée) |
| PropertyDetail | 865 | `/annonces/:id` | `useParams`, `useQuery` | `QueryClientProvider` + `MemoryRouter` + `Routes/Route` (`/annonces/1`) |
| SellProperty | 907 | `/vendre` | — (état local, formulaire multi-étapes) | `MemoryRouter` |

---

## Recette commune (chaque tâche de migration de page)

1. `import { useTranslation } from 'react-i18next'` ; `const { t } = useTranslation(['public', 'common'])`.
2. Remplacer **chaque** chaîne FR visible (texte JSX, `placeholder`, `label`, `title`, `aria-label`, boutons, options `<select>`, messages toast/erreur/succès, textes d'aide, libellés d'étapes) par `t('public:<section>.<key>')`. Réutiliser `common:*` quand la clé existe déjà (ex. `common:actions.search`, `common:errors.generic`, `common:validation.required`).
3. Ajouter chaque nouvelle clé dans `fr/public.json` (FR verbatim) ET `ar/public.json` (brouillon AR MSA), fichiers structurellement identiques.
4. Interpolation pour les variables ; ne pas concaténer.
5. RTL : classes directionnelles physiques → logiques ; icônes horizontales via `DirIcon`.
6. Données API/props → restent FR.
7. Ajouter `'src/pages/<Page>.jsx'` à `MIGRATED_FILES`. Garde-fou (texte + attributs) vert.

**Test de rendu (par page)** : monter avec les providers du tableau ci-dessus ; ancrer l'assertion sur `i18n.t('public:<section>.<titleKey>')` — une chaîne **statique** (jamais une donnée) et **unique** dans le rendu — en FR puis en AR (valeurs FR ≠ AR, donc la bascule est réellement vérifiée). Si le titre choisi n'apparaît qu'avec des données, choisir un libellé statique toujours rendu (titre de section, état de chargement/vide) et adapter la clé.

Chaque tâche suit ce cycle : **(1)** écrire le test → **(2)** le lancer, échoue → **(3)** migrer la page + `MIGRATED_FILES` → **(4)** relancer, passe → **(5)** `npm test && npm run build` verts → **(6)** commit.

---

## Task 1: Migrer `Checkout.jsx`

**Files:** Modify `src/pages/Checkout.jsx`, `src/locales/{fr,ar}/public.json`, `src/i18n/noHardcodedText.test.js` ; Create `src/pages/Checkout.test.jsx`.

Section `public:checkout.*`. Page panier/commande : titre, récap articles (libellés statiques), totaux, champs, boutons, états vide/erreur. `useSearchParams`. **Inspecter d'abord** si la page lit un contexte panier / localStorage : si l'état vide s'affiche sans données, ancrer le test sur le libellé d'état vide ; sinon fournir les providers requis.

- [ ] **Step 1: Test de rendu FR/AR** — Create `src/pages/Checkout.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import Checkout from './Checkout'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/panier']}><Checkout /></MemoryRouter>,
  )
}

describe('Checkout i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un libellé statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkout.title'))).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:checkout.title'))).toBeInTheDocument()
  })
})
```

(`public:checkout.title` = titre statique réel + brouillon AR distinct, unique dans le rendu. Adapter la clé/les providers si le titre ne s'affiche pas sans données de panier.)

- [ ] **Step 2:** `cd frontend && npm test -- Checkout` → FAIL.
- [ ] **Step 3:** Migrer `Checkout.jsx` (recette) + ajouter à `MIGRATED_FILES`.
- [ ] **Step 4:** `cd frontend && npm test -- Checkout` → PASS.
- [ ] **Step 5:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Checkout.jsx frontend/src/pages/Checkout.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page Checkout bilingue (public:checkout)"
```

---

## Task 2: Migrer `AgencyPricing.jsx`

**Files:** Modify `src/pages/AgencyPricing.jsx`, `src/locales/{fr,ar}/public.json`, `src/i18n/noHardcodedText.test.js` ; Create `src/pages/AgencyPricing.test.jsx`.

Section `public:agencyPricing.*`. Page tarifs agences : titre/sous-titre, cartes de plans (noms de plans statiques, features, CTA), tableau comparatif, FAQ. `useQuery`. Les montants restent tels quels (données/format).

- [ ] **Step 1: Test de rendu FR/AR** — Create `src/pages/AgencyPricing.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import AgencyPricing from './AgencyPricing'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AgencyPricing /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AgencyPricing i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:agencyPricing.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:agencyPricing.title'))).toBeInTheDocument()
  })
})
```

- [ ] **Step 2:** `cd frontend && npm test -- AgencyPricing` → FAIL.
- [ ] **Step 3:** Migrer `AgencyPricing.jsx` (recette) + `MIGRATED_FILES`.
- [ ] **Step 4:** `cd frontend && npm test -- AgencyPricing` → PASS.
- [ ] **Step 5:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AgencyPricing.jsx frontend/src/pages/AgencyPricing.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page AgencyPricing bilingue (public:agencyPricing)"
```

---

## Task 3: Migrer `PropertyList.jsx`

**Files:** Modify `src/pages/PropertyList.jsx`, `src/locales/{fr,ar}/public.json`, `src/i18n/noHardcodedText.test.js` ; Create `src/pages/PropertyList.test.jsx`.

Section `public:propertyList.*`. Liste des annonces : titre, barre de recherche/filtres (labels + placeholders + options select : type de bien, transaction, tri), compteur de résultats (interpolation `{{count}}`), états vide/chargement, pagination. `useQuery` + `useSearchParams`. Titres/descriptions de biens = données FR.

- [ ] **Step 1: Test de rendu FR/AR** — Create `src/pages/PropertyList.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import PropertyList from './PropertyList'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/annonces']}><PropertyList /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PropertyList i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un libellé statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:propertyList.title'))).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:propertyList.title'))).toBeInTheDocument()
  })
})
```

(Si `propertyList.title` n'est pas statique/unique, ancrer sur un libellé de filtre toujours rendu — ex. le label du tri.)

- [ ] **Step 2:** `cd frontend && npm test -- PropertyList` → FAIL.
- [ ] **Step 3:** Migrer `PropertyList.jsx` (recette) + `MIGRATED_FILES`.
- [ ] **Step 4:** `cd frontend && npm test -- PropertyList` → PASS.
- [ ] **Step 5:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PropertyList.jsx frontend/src/pages/PropertyList.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page PropertyList bilingue (public:propertyList)"
```

---

## Task 4: Migrer `ProgramDetail.jsx`

**Files:** Modify `src/pages/ProgramDetail.jsx`, `src/locales/{fr,ar}/public.json`, `src/i18n/noHardcodedText.test.js` ; Create `src/pages/ProgramDetail.test.jsx`.

Section `public:programDetail.*`. Détail d'un programme neuf : libellés statiques (onglets, sections « Localisation »/« Lots disponibles »/« Équipements », labels de caractéristiques, CTA contact/visite), états vide/chargement. `useParams(slug)` + `useQuery`. Nom/description du programme et lots = données FR.

- [ ] **Step 1: Test de rendu FR/AR** — Create `src/pages/ProgramDetail.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import ProgramDetail from './ProgramDetail'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/programmes/demo']}>
        <Routes><Route path="/programmes/:slug" element={<ProgramDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProgramDetail i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un libellé statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:programDetail.loading'))).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:programDetail.loading'))).toBeInTheDocument()
  })
})
```

(Sans données, la page affiche son état de chargement/vide : ancrer le test sur ce libellé statique — `public:programDetail.loading` ou l'équivalent réel. Adapter la clé au libellé réellement rendu.)

- [ ] **Step 2:** `cd frontend && npm test -- ProgramDetail` → FAIL.
- [ ] **Step 3:** Migrer `ProgramDetail.jsx` (recette) + `MIGRATED_FILES`.
- [ ] **Step 4:** `cd frontend && npm test -- ProgramDetail` → PASS.
- [ ] **Step 5:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProgramDetail.jsx frontend/src/pages/ProgramDetail.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page ProgramDetail bilingue (public:programDetail)"
```

---

## Task 5: Migrer `Services.jsx`

**Files:** Modify `src/pages/Services.jsx`, `src/locales/{fr,ar}/public.json`, `src/i18n/noHardcodedText.test.js` ; Create `src/pages/Services.test.jsx`.

Section `public:services.*`. Page services : titre/sous-titre, cartes de services (titres + descriptions statiques), sections détaillées, CTA. Routes `/nos-services` et `/nos-services/:service`. **Attention** : si la page contient un gros objet de données de services codé en dur (titres/descriptions par service), migrer ces libellés vers des clés `public:services.<slug>.*` (ce sont du contenu applicatif statique, pas des données API).

- [ ] **Step 1: Test de rendu FR/AR** — Create `src/pages/Services.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import Services from './Services'

function renderPage() {
  return render(<MemoryRouter initialEntries={['/nos-services']}><Services /></MemoryRouter>)
}

describe('Services i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:services.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:services.title'))).toBeInTheDocument()
  })
})
```

- [ ] **Step 2:** `cd frontend && npm test -- Services` → FAIL.
- [ ] **Step 3:** Migrer `Services.jsx` (recette) + `MIGRATED_FILES`.
- [ ] **Step 4:** `cd frontend && npm test -- Services` → PASS.
- [ ] **Step 5:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Services.jsx frontend/src/pages/Services.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page Services bilingue (public:services)"
```

---

## Task 6: Migrer `PropertyDetail.jsx`

**Files:** Modify `src/pages/PropertyDetail.jsx`, `src/locales/{fr,ar}/public.json`, `src/i18n/noHardcodedText.test.js` ; Create `src/pages/PropertyDetail.test.jsx`.

Section `public:propertyDetail.*`. La plus grosse page (865 l) : galerie, caractéristiques (labels : surface, chambres, salles de bain, étage…), sections description/équipements/localisation, formulaire de contact/visite (labels + placeholders + toasts), boutons de partage, bloc agence. `useParams(id)` + `useQuery`. Titre/description/prix du bien et infos agence = données FR.

- [ ] **Step 1: Test de rendu FR/AR** — Create `src/pages/PropertyDetail.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../i18n'
import PropertyDetail from './PropertyDetail'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/annonces/1']}>
        <Routes><Route path="/annonces/:id" element={<PropertyDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PropertyDetail i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend un libellé statique en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:propertyDetail.loading'))).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:propertyDetail.loading'))).toBeInTheDocument()
  })
})
```

(Sans données, ancrer sur l'état de chargement/vide statique — `public:propertyDetail.loading` ou l'équivalent réel. Adapter au libellé réellement rendu.)

- [ ] **Step 2:** `cd frontend && npm test -- PropertyDetail` → FAIL.
- [ ] **Step 3:** Migrer `PropertyDetail.jsx` (recette) + `MIGRATED_FILES`. Vu la taille, procéder section par section pour ne rien manquer ; le garde-fou attrape les oublis.
- [ ] **Step 4:** `cd frontend && npm test -- PropertyDetail` → PASS.
- [ ] **Step 5:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PropertyDetail.jsx frontend/src/pages/PropertyDetail.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page PropertyDetail bilingue (public:propertyDetail)"
```

---

## Task 7: Migrer `SellProperty.jsx`

**Files:** Modify `src/pages/SellProperty.jsx`, `src/locales/{fr,ar}/public.json`, `src/i18n/noHardcodedText.test.js` ; Create `src/pages/SellProperty.test.jsx`.

Section `public:sellProperty.*`. La plus grosse page (907 l) : formulaire multi-étapes de mise en vente/estimation. Migrer titres d'étapes, tous les labels/placeholders/options select, textes d'aide, boutons de navigation (Précédent/Suivant/Envoyer via `common:actions.*` si dispo), messages de validation (react-hook-form → `common:validation.*`), toasts succès/erreur. État local (pas d'API pour l'affichage initial).

- [ ] **Step 1: Test de rendu FR/AR** — Create `src/pages/SellProperty.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../i18n'
import SellProperty from './SellProperty'

function renderPage() {
  return render(<MemoryRouter initialEntries={['/vendre']}><SellProperty /></MemoryRouter>)
}

describe('SellProperty i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le titre en FR', async () => {
    renderPage()
    expect(await screen.findByText(i18n.t('public:sellProperty.title'))).toBeInTheDocument()
  })
  it('rend le titre en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText(i18n.t('public:sellProperty.title'))).toBeInTheDocument()
  })
})
```

(`public:sellProperty.title` = titre principal statique de la 1re étape + brouillon AR distinct, unique.)

- [ ] **Step 2:** `cd frontend && npm test -- SellProperty` → FAIL.
- [ ] **Step 3:** Migrer `SellProperty.jsx` (recette) + `MIGRATED_FILES`. Section par section vu la taille.
- [ ] **Step 4:** `cd frontend && npm test -- SellProperty` → PASS.
- [ ] **Step 5:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/SellProperty.jsx frontend/src/pages/SellProperty.test.jsx frontend/src/i18n/noHardcodedText.test.js frontend/src/locales/fr/public.json frontend/src/locales/ar/public.json
git commit -m "feat(i18n): page SellProperty bilingue (public:sellProperty)"
```

---

## Validation finale du lot 2c

- [ ] `cd frontend && npm test` → tous verts (parité fr/ar, garde-fou texte+attributs sur toutes les pages migrées, tests de rendu des 7 pages).
- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] `MIGRATED_FILES` inclut les 19 pages publiques (12 des lots 2a/2b + 7 de ce lot) ; le garde-fou ne signale rien.
- [ ] Manuel : `npm run dev`, ouvrir `/annonces`, une fiche bien, `/programmes/<slug>`, `/agences/tarifs`, `/nos-services`, `/vendre`, `/panier` → bascule FR↔AR OK, RTL correct.
- [ ] **Phase 1 publique TERMINÉE.** Restent (hors ce lot) : `components/`, `backoffice/`, `dashboard/`, `admin/`, puis Phases 2–4.
