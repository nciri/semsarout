# i18n Phase 1 — Lot 1 (auth) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre bilingues FR/AR les 5 pages `pages/auth/` du front semsarout via extraction i18n (namespace `auth`) avec brouillon arabe immédiat.

**Architecture:** Chaque page voit son texte FR codé en dur remplacé par `t('auth:section.key')` (ou `t('common:validation.*')`/`t('common:errors.*')` pour les messages mutualisés) ; clés renseignées en FR + brouillon AR (MSA) ; classes directionnelles Tailwind → logiques ; garde-fous parité FR/AR + i18next-parser.

**Tech Stack:** react-i18next, i18next-parser, Vitest + @testing-library/react.

## Global Constraints

- Langues : `fr` (défaut+fallback) et `ar`. Clé localStorage `lang`.
- Namespaces : réutiliser `common`, créer `auth`. Import statique dans `src/i18n/index.js`.
- Conventions Phase 0 : `useTranslation('ns')`, clés `t('ns:section.key')`, utilitaires Tailwind logiques natifs (`ms/me/ps/pe/start/end/text-start/text-end/rounded-s/rounded-e/border-s/border-e`), AUCUN plugin RTL, `DirIcon` pour icônes horizontalement directionnelles.
- **Messages mutualisés** (ne PAS dupliquer par fichier) → `common:validation.*` et `common:errors.*` (définis en Task 1).
- Migration incrémentale : `npm test` + `npm run build` verts à chaque commit ; chaînes hors périmètre (données API) restent FR figé.
- Brouillon AR : arabe **standard (MSA)**. Glossaire de ton : registre formel, « Email » → « البريد الإلكتروني », « Mot de passe » → « كلمة المرور », « se connecter » → « تسجيل الدخول », « s'inscrire/créer un compte » → « إنشاء حساب ».
- Répertoire : `frontend/`. Branche : `feature/i18n-arabe`.

---

## File Structure

- Modify: `frontend/src/locales/fr/common.json`, `frontend/src/locales/ar/common.json` — ajout sections `validation` + `errors`.
- Create: `frontend/src/locales/fr/auth.json`, `frontend/src/locales/ar/auth.json`.
- Modify: `frontend/src/i18n/index.js` — enregistrer le namespace `auth`.
- Modify: `frontend/src/i18n/keyParity.test.js` — couvrir `auth`.
- Create: `frontend/i18next-parser.config.js` ; Modify `frontend/package.json` (dep + script `i18n:check`).
- Modify (une par tâche) : `frontend/src/pages/auth/{Login,ForgotPassword,ResetPassword,AcceptInvitation,Register}.jsx`.
- Create (tests) : `frontend/src/pages/auth/{Login,ForgotPassword,ResetPassword,AcceptInvitation,Register}.test.jsx`.

---

## Task 1: Infra — clés mutualisées, namespace `auth`, i18next-parser

**Files:**
- Modify: `frontend/src/locales/fr/common.json`, `frontend/src/locales/ar/common.json`
- Create: `frontend/src/locales/fr/auth.json`, `frontend/src/locales/ar/auth.json`
- Modify: `frontend/src/i18n/index.js`, `frontend/src/i18n/keyParity.test.js`
- Create: `frontend/i18next-parser.config.js`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: namespace `auth` chargé (`t('auth:...')`) ; clés `common:validation.{emailRequired,emailInvalid,passwordRequired,passwordMin8,passwordsMismatch,firstNameRequired,lastNameRequired,confirmationRequired}` et `common:errors.{generic,short}` disponibles ; script `npm run i18n:check`.

- [ ] **Step 1: Ajouter `validation` + `errors` à `fr/common.json`**

Remplacer le contenu de `frontend/src/locales/fr/common.json` par :

```json
{
  "language": { "fr": "Français", "ar": "العربية" },
  "actions": { "search": "Rechercher...", "logout": "Déconnexion" },
  "validation": {
    "emailRequired": "Email requis",
    "emailInvalid": "Email invalide",
    "passwordRequired": "Mot de passe requis",
    "passwordMin8": "Minimum 8 caractères",
    "passwordsMismatch": "Les mots de passe ne correspondent pas",
    "firstNameRequired": "Prénom requis",
    "lastNameRequired": "Nom requis",
    "confirmationRequired": "Confirmation requise"
  },
  "errors": {
    "generic": "Une erreur est survenue",
    "short": "Erreur"
  }
}
```

- [ ] **Step 2: Ajouter les mêmes sections à `ar/common.json`**

Remplacer le contenu de `frontend/src/locales/ar/common.json` par :

```json
{
  "language": { "fr": "الفرنسية", "ar": "العربية" },
  "actions": { "search": "بحث...", "logout": "تسجيل الخروج" },
  "validation": {
    "emailRequired": "البريد الإلكتروني مطلوب",
    "emailInvalid": "بريد إلكتروني غير صالح",
    "passwordRequired": "كلمة المرور مطلوبة",
    "passwordMin8": "8 أحرف على الأقل",
    "passwordsMismatch": "كلمتا المرور غير متطابقتين",
    "firstNameRequired": "الاسم الأول مطلوب",
    "lastNameRequired": "اسم العائلة مطلوب",
    "confirmationRequired": "التأكيد مطلوب"
  },
  "errors": {
    "generic": "حدث خطأ ما",
    "short": "خطأ"
  }
}
```

- [ ] **Step 3: Créer les fichiers `auth.json` vides**

Create `frontend/src/locales/fr/auth.json` :

```json
{}
```

Create `frontend/src/locales/ar/auth.json` :

```json
{}
```

- [ ] **Step 4: Enregistrer le namespace `auth` dans l'init**

Modify `frontend/src/i18n/index.js` :
- Ajouter les imports après ceux de backoffice :

```js
import frAuth from '../locales/fr/auth.json'
import arAuth from '../locales/ar/auth.json'
```

- Étendre `resources` :

```js
const resources = {
  fr: { common: frCommon, backoffice: frBackoffice, auth: frAuth },
  ar: { common: arCommon, backoffice: arBackoffice, auth: arAuth },
}
```

- Étendre `ns` : `ns: ['common', 'backoffice', 'auth'],`

- [ ] **Step 5: Étendre le test de parité au namespace `auth`**

Modify `frontend/src/i18n/keyParity.test.js` :
- Ajouter les imports (après ceux de backoffice) :

```js
import frAuth from '../locales/fr/auth.json'
import arAuth from '../locales/ar/auth.json'
```

- Ajouter la ligne dans le `it.each` (après celle de `backoffice`) :

```js
    ['auth', frAuth, arAuth],
```

- [ ] **Step 6: Installer i18next-parser**

```bash
cd frontend
npm install -D i18next-parser
```

- [ ] **Step 7: Config i18next-parser (garde-fou clés manquantes)**

Create `frontend/i18next-parser.config.js` :

```js
// Garde-fou : détecte les t('ns:clé') référencées mais absentes des JSON.
// failOnUpdate => échoue si le catalogue devrait changer (clé manquante).
// keepRemoved => n'efface pas les clés non détectées (interpolation dynamique tolérée).
module.exports = {
  locales: ['fr', 'ar'],
  output: 'src/locales/$LOCALE/$NAMESPACE.json',
  input: ['src/**/*.{js,jsx}'],
  defaultNamespace: 'common',
  keySeparator: '.',
  namespaceSeparator: ':',
  keepRemoved: true,
  failOnUpdate: true,
  sort: true,
  createOldCatalogs: false,
}
```

- [ ] **Step 8: Ajouter le script `i18n:check`**

Modify `frontend/package.json` — dans `"scripts"`, après `"test"` :

```json
    "i18n:check": "i18next-parser --config i18next-parser.config.js"
```

- [ ] **Step 9: Lancer parité + build**

Run: `cd frontend && npm test -- keyParity`
Expected: PASS (common étendu + auth vide, parité verte).
Run: `cd frontend && npm run build`
Expected: `✓ built`.

Note : `npm run i18n:check` n'est PAS lancé ici (aucune page ne référence encore `auth:*`) ; il devient utile dès la Task 2. Ne pas l'exiger vert tant que des clés dynamiques non extraites subsistent dans d'autres surfaces — l'utiliser en **information** par lot, pas en gate bloquant global.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/locales frontend/src/i18n/index.js frontend/src/i18n/keyParity.test.js frontend/i18next-parser.config.js frontend/package.json frontend/package-lock.json
git commit -m "feat(i18n): namespace auth + cles mutualisees common:validation/errors + i18next-parser"
```

---

## Recette commune aux Tasks 2–6 (migration d'un fichier)

Pour le fichier de la tâche :
1. `import { useTranslation } from 'react-i18next'` ; dans le composant : `const { t } = useTranslation(['auth', 'common'])` (ou `useTranslation('auth')` et clés `common:...` préfixées).
2. Remplacer **chaque** chaîne FR visible listée dans la tâche par `t('auth:<section>.<key>')` — y compris `placeholder`, `label`, texte de bouton, titres, et les **toasts**/messages `react-hook-form` (`required: '...'`, `message: '...'`, `validate: () => '...'`).
3. Pour les messages **mutualisés**, utiliser les clés `common:*` (ne PAS créer de doublon dans `auth`) :
   - `'Email requis'` → `t('common:validation.emailRequired')`
   - `'Email invalide'` → `t('common:validation.emailInvalid')`
   - `'Mot de passe requis'` → `t('common:validation.passwordRequired')`
   - `'Minimum 8 caractères'` / `'Mot de passe : 8 caractères minimum'` → `t('common:validation.passwordMin8')`
   - `'Les mots de passe ne correspondent pas'` → `t('common:validation.passwordsMismatch')`
   - `'Prénom requis'` → `t('common:validation.firstNameRequired')` ; `'Nom requis'` → `t('common:validation.lastNameRequired')` ; `'Confirmation requise'` → `t('common:validation.confirmationRequired')`
   - `'Une erreur est survenue'` → `t('common:errors.generic')` ; `'Erreur'` → `t('common:errors.short')`
4. Ajouter chaque **nouvelle** clé `auth:<section>.*` dans `frontend/src/locales/fr/auth.json` (FR verbatim) ET `frontend/src/locales/ar/auth.json` (**brouillon AR MSA**), en gardant les deux fichiers **structurellement identiques** (parité).
5. **RTL** : convertir les classes directionnelles physiques en logiques ; envelopper les icônes horizontalement directionnelles (`FiArrowRight/Left`, chevrons latéraux) avec `DirIcon` (`import DirIcon from '../../components/common/DirIcon'`). Les icônes non directionnelles (mail, cadenas, œil) restent inchangées.
6. Interpolation : pour les textes à variable (ex. « Rejoindre {agency} »), utiliser l'interpolation i18next : `t('auth:invite.joinTitle', { agency: data.agency_name })` avec la valeur `"Rejoindre {{agency}}"`.
7. Laisser en FR les chaînes de **données** renvoyées par l'API (non listées).

Test de rendu (adapté par tâche) : monter la page (providers requis : `MemoryRouter`, et `QueryClientProvider` si la page utilise react-query) et vérifier une chaîne représentative en FR puis en AR après `i18n.changeLanguage('ar')` (`findByText` si un état de chargement asynchrone précède l'affichage).

---

## Task 2: Migrer `Login.jsx`

**Files:**
- Modify: `frontend/src/pages/auth/Login.jsx`
- Test: `frontend/src/pages/auth/Login.test.jsx`

**Chaînes FR à extraire → `auth:login.*`** (réutiliser `common:*` pour les messages mutualisés) :
- label `Email` → `auth:login.emailLabel` ; placeholder `votre@email.com` → `auth:login.emailPlaceholder`
- validation `Email requis`/`Email invalide` → `common:validation.emailRequired`/`emailInvalid`
- label `Mot de passe` → `auth:login.passwordLabel` ; validation `Mot de passe requis` → `common:validation.passwordRequired`
- `Se souvenir de moi` → `auth:login.rememberMe`
- bouton `Se connecter` / `Connexion en cours...` → `auth:login.submit` / `auth:login.submitting`
- tout autre libellé visible de la page (titre, lien « mot de passe oublié ? », lien vers l'inscription) → `auth:login.*`

**Interfaces:** Consomme le namespace `auth` (Task 1) et `common:validation.*`.

- [ ] **Step 1: Écrire le test de rendu FR/AR**

Create `frontend/src/pages/auth/Login.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Login from './Login'

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Login i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend le bouton en FR', async () => {
    renderLogin()
    expect(await screen.findByText('Se connecter')).toBeInTheDocument()
  })

  it('rend le bouton en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderLogin()
    expect(await screen.findByText('تسجيل الدخول')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- Login`
Expected: FAIL (texte AR `تسجيل الدخول` introuvable, bouton encore codé en dur).

- [ ] **Step 3: Migrer `Login.jsx`** (suivre la recette commune ci-dessus + le mapping de la tâche). Ajouter les clés `auth:login.*` dans `fr/auth.json` (FR) et `ar/auth.json` (AR, avec `submit` = `"تسجيل الدخول"`). Convertir les classes directionnelles en logiques.

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- Login`
Expected: PASS.

- [ ] **Step 5: Suite + build + garde-fou**

Run: `cd frontend && npm test`  → tout vert (parité incluse).
Run: `cd frontend && npm run build`  → `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/auth/Login.jsx frontend/src/pages/auth/Login.test.jsx frontend/src/locales/fr/auth.json frontend/src/locales/ar/auth.json
git commit -m "feat(i18n): page Login bilingue (auth:login)"
```

---

## Task 3: Migrer `ForgotPassword.jsx`

**Files:**
- Modify: `frontend/src/pages/auth/ForgotPassword.jsx`
- Test: `frontend/src/pages/auth/ForgotPassword.test.jsx`

**Chaînes FR → `auth:forgot.*`** (+ `common:*`) :
- `Email envoyé` → `auth:forgot.sentTitle`
- label `Email` → `auth:forgot.emailLabel` ; placeholder `votre@email.com` → `auth:forgot.emailPlaceholder`
- validations → `common:validation.emailRequired`/`emailInvalid`
- bouton `Envoyer le lien de réinitialisation` / `Envoi...` → `auth:forgot.submit` / `auth:forgot.submitting`
- erreur `Une erreur est survenue` → `common:errors.generic`
- titre/intro et lien retour connexion visibles → `auth:forgot.*`

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/auth/ForgotPassword.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import ForgotPassword from './ForgotPassword'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ForgotPassword /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ForgotPassword i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le bouton en FR', async () => {
    renderPage()
    expect(await screen.findByText('Envoyer le lien de réinitialisation')).toBeInTheDocument()
  })
  it('rend le bouton en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('إرسال رابط إعادة التعيين')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- ForgotPassword`  → FAIL (AR introuvable).

- [ ] **Step 3: Migrer `ForgotPassword.jsx`** (recette + mapping). `auth:forgot.submit` FR `"Envoyer le lien de réinitialisation"`, AR `"إرسال رابط إعادة التعيين"`. Classes logiques.

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- ForgotPassword`  → PASS.

- [ ] **Step 5: Suite + build**

Run: `cd frontend && npm test && npm run build`  → verts.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/auth/ForgotPassword.jsx frontend/src/pages/auth/ForgotPassword.test.jsx frontend/src/locales/fr/auth.json frontend/src/locales/ar/auth.json
git commit -m "feat(i18n): page ForgotPassword bilingue (auth:forgot)"
```

---

## Task 4: Migrer `ResetPassword.jsx`

**Files:**
- Modify: `frontend/src/pages/auth/ResetPassword.jsx`
- Test: `frontend/src/pages/auth/ResetPassword.test.jsx`

**Chaînes FR → `auth:reset.*`** (+ `common:*`) :
- `Mot de passe réinitialisé` → `auth:reset.doneTitle`
- label `Nouveau mot de passe` → `auth:reset.newPasswordLabel` ; `Confirmer le mot de passe` → `auth:reset.confirmLabel`
- validations `Mot de passe requis`/`Minimum 8 caractères`/`Confirmation requise`/`Les mots de passe ne correspondent pas` → `common:validation.*`
- bouton `Réinitialiser le mot de passe` / `Réinitialisation...` → `auth:reset.submit` / `auth:reset.submitting`
- erreur `Une erreur est survenue` → `common:errors.generic`

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/auth/ResetPassword.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import ResetPassword from './ResetPassword'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ResetPassword /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ResetPassword i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le bouton en FR', async () => {
    renderPage()
    expect(await screen.findByText('Réinitialiser le mot de passe')).toBeInTheDocument()
  })
  it('rend le bouton en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('إعادة تعيين كلمة المرور')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- ResetPassword`  → FAIL.

- [ ] **Step 3: Migrer `ResetPassword.jsx`** (recette + mapping). `auth:reset.submit` FR `"Réinitialiser le mot de passe"`, AR `"إعادة تعيين كلمة المرور"`. Classes logiques.

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- ResetPassword`  → PASS.

- [ ] **Step 5: Suite + build**

Run: `cd frontend && npm test && npm run build`  → verts.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/auth/ResetPassword.jsx frontend/src/pages/auth/ResetPassword.test.jsx frontend/src/locales/fr/auth.json frontend/src/locales/ar/auth.json
git commit -m "feat(i18n): page ResetPassword bilingue (auth:reset)"
```

---

## Task 5: Migrer `AcceptInvitation.jsx`

**Files:**
- Modify: `frontend/src/pages/auth/AcceptInvitation.jsx`
- Test: `frontend/src/pages/auth/AcceptInvitation.test.jsx`

**Chaînes FR → `auth:invite.*`** (+ `common:*`) :
- toasts : `Mot de passe : 8 caractères minimum` → `common:validation.passwordMin8` ; `Les mots de passe ne correspondent pas` → `common:validation.passwordsMismatch` ; `Bienvenue dans l'équipe !` → `auth:invite.welcome` ; `Erreur` → `common:errors.short`
- `Chargement…` → `auth:invite.loading`
- `Cette invitation a expiré.` → `auth:invite.expired` ; `Invitation invalide.` → `auth:invite.invalid` ; `Aller à la connexion` → `auth:invite.goToLogin`
- titre `Rejoindre {agency}` → `auth:invite.joinTitle` (interpolation, valeur FR `"Rejoindre {{agency}}"`)
- sous-titre `Invitation pour {email}{role}` → `auth:invite.subtitle` (interpolation `{{email}}`)
- placeholders `Prénom`/`Nom`/`Mot de passe (8 car. min.)`/`Confirmer le mot de passe` → `auth:invite.*`
- bouton `Activer mon compte` / `Création…` → `auth:invite.submit` / `auth:invite.submitting`

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/auth/AcceptInvitation.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import AcceptInvitation from './AcceptInvitation'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AcceptInvitation /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AcceptInvitation i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le chargement en FR', async () => {
    renderPage()
    expect(await screen.findByText('Chargement…')).toBeInTheDocument()
  })
  it('rend le chargement en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('جارٍ التحميل…')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- AcceptInvitation`  → FAIL.

- [ ] **Step 3: Migrer `AcceptInvitation.jsx`** (recette + mapping ; interpolation pour `joinTitle`/`subtitle`). `auth:invite.loading` FR `"Chargement…"`, AR `"جارٍ التحميل…"`. Classes logiques.

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- AcceptInvitation`  → PASS.

- [ ] **Step 5: Suite + build**

Run: `cd frontend && npm test && npm run build`  → verts.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/auth/AcceptInvitation.jsx frontend/src/pages/auth/AcceptInvitation.test.jsx frontend/src/locales/fr/auth.json frontend/src/locales/ar/auth.json
git commit -m "feat(i18n): page AcceptInvitation bilingue (auth:invite)"
```

---

## Task 6: Migrer `Register.jsx`

Fichier le plus volumineux (~315 lignes, formulaire multi-sections). Migrer **toutes** les chaînes visibles → `auth:register.*` (+ `common:*` pour les validations mutualisées `first_name`/`last_name`/`email`/`password`).

**Files:**
- Modify: `frontend/src/pages/auth/Register.jsx`
- Test: `frontend/src/pages/auth/Register.test.jsx`

**Chaînes FR → `auth:register.*`** (échantillon non exhaustif — migrer **tout** le texte visible du fichier) :
- `Vous êtes intéressé par :`, `Type de compte`, `Vous êtes plutôt...`, `Je recherche une propriété`, `Je vends des propriétés`, `Qu'est-ce qui vous amène ?`, `(optionnel)`, labels `Prénom`/`Nom`/`Email`/`Téléphone`/`Mot de passe`, placeholders correspondants (`Prénom`, `Nom`, `votre@email.com`, `+212 6XX XXX XXX`), bouton de soumission, liens.
- validations react-hook-form `Prénom requis`/`Nom requis`/`Email requis`/`Email invalide`/`Mot de passe requis` → `common:validation.*`.

- [ ] **Step 1: Test de rendu FR/AR**

Create `frontend/src/pages/auth/Register.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Register from './Register'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Register /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Register i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })
  it('rend le libellé "Type de compte" en FR', async () => {
    renderPage()
    expect(await screen.findByText('Type de compte')).toBeInTheDocument()
  })
  it('rend le libellé en AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderPage()
    expect(await screen.findByText('نوع الحساب')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- Register`  → FAIL (`نوع الحساب` introuvable).

- [ ] **Step 3: Migrer `Register.jsx`** (recette + mapping ; migrer TOUT le texte visible). `auth:register.accountTypeLabel` FR `"Type de compte"`, AR `"نوع الحساب"`. Classes directionnelles → logiques ; icônes horizontales via `DirIcon`.

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- Register`  → PASS.

- [ ] **Step 5: Suite complète + build + garde-fou i18next-parser**

Run: `cd frontend && npm test`  → tout vert (parité incluse).
Run: `cd frontend && npm run i18n:check`  → informatif : vérifier qu'aucune clé `auth:*` référencée dans `pages/auth/` n'est manquante (les avertissements sur d'autres surfaces non migrées sont attendus).
Run: `cd frontend && npm run build`  → `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/auth/Register.jsx frontend/src/pages/auth/Register.test.jsx frontend/src/locales/fr/auth.json frontend/src/locales/ar/auth.json
git commit -m "feat(i18n): page Register bilingue (auth:register)"
```

---

## Validation finale du lot auth

- [ ] `cd frontend && npm test` → tous verts (parité common+backoffice+auth, tests de rendu des 5 pages).
- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] Manuel : `npm run dev`, ouvrir `/connexion`, `/inscription`, `/mot-de-passe-oublie`, basculer FR↔AR → chaque page se traduit, mise en page RTL correcte, aucune clé brute affichée.
- [ ] Les 5 fichiers `pages/auth/` ne contiennent plus de texte FR visible codé en dur (hors données API).
