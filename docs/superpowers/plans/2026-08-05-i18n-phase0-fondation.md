# i18n Phase 0 — Fondation i18n + RTL (semsarout) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser l'infrastructure i18n + RTL du front semsarout et la prouver sur une surface témoin (coquille back-office + page tableau de bord), en français par défaut avec bascule arabe.

**Architecture:** react-i18next avec ressources JSON par langue chargées statiquement ; direction (`dir`/`lang`) synchronisée sur `<html>` au changement de langue ; RTL via utilitaires logiques Tailwind natifs (3.4) + police arabe + miroir d'icônes ; migration incrémentale (surfaces non traitées = FR figé, l'app reste fonctionnelle).

**Tech Stack:** React 18, Vite 7, Tailwind 3.4, react-i18next + i18next + i18next-browser-languagedetector, Vitest + @testing-library/react + jsdom (à installer).

## Global Constraints

- Langues : `fr` (défaut + fallback) et `ar` uniquement. Clé localStorage : `lang`.
- Namespaces Phase 0 : `common` et `backoffice` (uniquement).
- Chargement des ressources : **import statique groupé** dans `src/i18n/index.js` (pas de lazy-load).
- Tailwind **3.4** : utilitaires logiques **natifs** (`ms/me/ps/pe/start/end/text-start/text-end/rounded-s/rounded-e`), **aucun** plugin RTL.
- Police arabe : **Noto Sans Arabic** via le paquet `@fontsource/noto-sans-arabic`.
- Chiffres : arabes **occidentaux** (`1 500 000`) même en `ar`.
- Migration **incrémentale** : `npm run build` doit passer et l'app fonctionner après chaque tâche ; les surfaces non migrées restent en FR codé en dur.
- Secrets : aucun dans cette phase (pas d'appel réseau).
- Répertoire de travail : `frontend/`. Branche : `feature/i18n-arabe`.

---

## File Structure

- `frontend/vitest.config.js` — config Vitest (jsdom, setup).
- `frontend/src/test/setup.js` — setup testing-library (jest-dom).
- `frontend/src/i18n/index.js` — init i18next (langues, ressources, détecteur).
- `frontend/src/i18n/rtl.js` — `isRtl(lang)`, `applyDirection(lang)`.
- `frontend/src/i18n/rtl.test.js` — tests unitaires de `rtl.js`.
- `frontend/src/i18n/keyParity.test.js` — garde-fou de parité de clés FR/AR.
- `frontend/src/locales/fr/common.json`, `frontend/src/locales/ar/common.json`.
- `frontend/src/locales/fr/backoffice.json`, `frontend/src/locales/ar/backoffice.json`.
- `frontend/src/components/common/LanguageSwitcher.jsx` (+ `.test.jsx`).
- `frontend/src/components/common/DirIcon.jsx` — wrapper de miroir d'icône directionnelle.
- Modifiés : `frontend/src/main.jsx`, `frontend/src/App.jsx` (effet direction), `frontend/package.json`, `frontend/tailwind.config.js`, `frontend/src/assets/styles/index.css`, `frontend/src/pages/backoffice/components/BackofficeLayout.jsx`, `frontend/src/pages/backoffice/Dashboard.jsx`.

---

## Task 1: Infrastructure de test (Vitest + testing-library)

Le front n'a aucun runner de test. Cette tâche l'installe pour permettre le TDD des suivantes.

**Files:**
- Modify: `frontend/package.json` (deps + script `test`)
- Create: `frontend/vitest.config.js`
- Create: `frontend/src/test/setup.js`
- Test: `frontend/src/test/smoke.test.js`

**Interfaces:**
- Produces: commande `npm test` (= `vitest run`) exécutant les fichiers `*.test.{js,jsx}` en environnement jsdom, avec les matchers `@testing-library/jest-dom` disponibles.

- [ ] **Step 1: Installer les dépendances de test**

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Créer la config Vitest**

Create `frontend/vitest.config.js` :

```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
```

- [ ] **Step 3: Créer le setup testing-library**

Create `frontend/src/test/setup.js` :

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Ajouter le script `test`**

Modify `frontend/package.json` — dans `"scripts"`, ajouter après `"lint"` :

```json
    "test": "vitest run"
```

- [ ] **Step 5: Écrire un test smoke**

Create `frontend/src/test/smoke.test.js` :

```js
import { describe, it, expect } from 'vitest'

describe('infra de test', () => {
  it('exécute les tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Lancer le test — doit passer**

Run: `cd frontend && npm test`
Expected: PASS (1 test, `smoke.test.js`).

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.js frontend/src/test/setup.js frontend/src/test/smoke.test.js
git commit -m "test(frontend): infrastructure Vitest + testing-library"
```

---

## Task 2: Cœur i18n (ressources JSON + init) + garde-fou de parité

Installe react-i18next, crée les ressources FR/AR (`common`, `backoffice`) et l'init, puis un test garantissant que `fr` et `ar` ont exactement les mêmes clés.

**Files:**
- Modify: `frontend/package.json` (deps)
- Create: `frontend/src/locales/fr/common.json`, `frontend/src/locales/ar/common.json`
- Create: `frontend/src/locales/fr/backoffice.json`, `frontend/src/locales/ar/backoffice.json`
- Create: `frontend/src/i18n/index.js`
- Modify: `frontend/src/main.jsx`
- Test: `frontend/src/i18n/keyParity.test.js`

**Interfaces:**
- Produces: `import i18n from './i18n'` (instance i18next initialisée, langue par défaut `fr`, fallback `fr`, namespaces `common` + `backoffice`). `t('common:actions.logout')`, `t('backoffice:nav.dashboard')`, etc. `i18n.changeLanguage('ar')` bascule la langue.

- [ ] **Step 1: Installer react-i18next**

```bash
cd frontend
npm install react-i18next i18next i18next-browser-languagedetector
```

- [ ] **Step 2: Créer `fr/common.json`**

Create `frontend/src/locales/fr/common.json` :

```json
{
  "language": { "fr": "Français", "ar": "العربية" },
  "actions": { "search": "Rechercher...", "logout": "Déconnexion" }
}
```

- [ ] **Step 3: Créer `ar/common.json`**

Create `frontend/src/locales/ar/common.json` :

```json
{
  "language": { "fr": "الفرنسية", "ar": "العربية" },
  "actions": { "search": "بحث...", "logout": "تسجيل الخروج" }
}
```

- [ ] **Step 4: Créer `fr/backoffice.json`**

Create `frontend/src/locales/fr/backoffice.json` :

```json
{
  "nav": {
    "sections": { "main": "Principal", "crm": "CRM", "finance": "Finance", "admin": "Administration" },
    "dashboard": "Tableau de bord",
    "properties": "Biens immobiliers",
    "pipeline": "Pipeline",
    "clients": "Clients",
    "leads": "Leads",
    "visits": "Visites & RDV",
    "transactions": "Transactions",
    "contracts": "Contrats",
    "notaries": "Notaires",
    "artisans": "Artisans",
    "rental": "Gestion locative",
    "shop": "Boutique",
    "team": "Équipe",
    "analytics": "Analyses",
    "settings": "Paramètres"
  },
  "dashboard": {
    "title": "Tableau de bord",
    "subtitle": "Vue d'ensemble de votre activité",
    "stats": {
      "activeProperties": "Biens actifs",
      "newLeads": "Nouveaux leads",
      "plannedVisits": "Visites planifiées",
      "activePipeline": "Pipeline actif"
    },
    "latestLeads": "Derniers leads",
    "noRecentLead": "Aucun lead récent",
    "upcomingVisits": "Prochaines visites",
    "noPlannedVisit": "Aucune visite planifiée",
    "monthSummary": "Résumé du mois",
    "revenue": "Chiffre d'affaires",
    "soldProperties": "Biens vendus",
    "newClients": "Nouveaux clients",
    "activeTransactions": "Transactions actives",
    "quickActions": "Actions rapides",
    "addProperty": "Ajouter un bien",
    "newClient": "Nouveau client",
    "planVisit": "Planifier visite",
    "viewPipeline": "Voir le pipeline"
  }
}
```

- [ ] **Step 5: Créer `ar/backoffice.json`**

Create `frontend/src/locales/ar/backoffice.json` :

```json
{
  "nav": {
    "sections": { "main": "الرئيسية", "crm": "إدارة العملاء", "finance": "المالية", "admin": "الإدارة" },
    "dashboard": "لوحة التحكم",
    "properties": "العقارات",
    "pipeline": "مسار الصفقات",
    "clients": "العملاء",
    "leads": "العملاء المحتملون",
    "visits": "الزيارات والمواعيد",
    "transactions": "المعاملات",
    "contracts": "العقود",
    "notaries": "الموثقون",
    "artisans": "الحرفيون",
    "rental": "التسيير الكرائي",
    "shop": "المتجر",
    "team": "الفريق",
    "analytics": "التحليلات",
    "settings": "الإعدادات"
  },
  "dashboard": {
    "title": "لوحة التحكم",
    "subtitle": "نظرة عامة على نشاطك",
    "stats": {
      "activeProperties": "العقارات النشطة",
      "newLeads": "عملاء محتملون جدد",
      "plannedVisits": "زيارات مبرمجة",
      "activePipeline": "مسار نشط"
    },
    "latestLeads": "آخر العملاء المحتملين",
    "noRecentLead": "لا يوجد عميل محتمل حديث",
    "upcomingVisits": "الزيارات القادمة",
    "noPlannedVisit": "لا توجد زيارة مبرمجة",
    "monthSummary": "ملخص الشهر",
    "revenue": "رقم المعاملات",
    "soldProperties": "عقارات مباعة",
    "newClients": "عملاء جدد",
    "activeTransactions": "معاملات نشطة",
    "quickActions": "إجراءات سريعة",
    "addProperty": "إضافة عقار",
    "newClient": "عميل جديد",
    "planVisit": "برمجة زيارة",
    "viewPipeline": "عرض مسار الصفقات"
  }
}
```

- [ ] **Step 6: Créer l'init i18next**

Create `frontend/src/i18n/index.js` :

```js
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import frCommon from '../locales/fr/common.json'
import arCommon from '../locales/ar/common.json'
import frBackoffice from '../locales/fr/backoffice.json'
import arBackoffice from '../locales/ar/backoffice.json'

export const SUPPORTED_LANGS = ['fr', 'ar']

const resources = {
  fr: { common: frCommon, backoffice: frBackoffice },
  ar: { common: arCommon, backoffice: arBackoffice },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    supportedLngs: SUPPORTED_LANGS,
    ns: ['common', 'backoffice'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
  })

export default i18n
```

- [ ] **Step 7: Charger i18n au démarrage**

Modify `frontend/src/main.jsx` — ajouter l'import après les imports existants (avant le rendu) :

```js
import './i18n'
```

(Le placer juste après `import App from './App'`.)

- [ ] **Step 8: Écrire le test de parité des clés**

Create `frontend/src/i18n/keyParity.test.js` :

```js
import { describe, it, expect } from 'vitest'
import frCommon from '../locales/fr/common.json'
import arCommon from '../locales/ar/common.json'
import frBackoffice from '../locales/fr/backoffice.json'
import arBackoffice from '../locales/ar/backoffice.json'

function flatKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' ? flatKeys(v, key) : [key]
  })
}

describe('parité des clés FR/AR', () => {
  it.each([
    ['common', frCommon, arCommon],
    ['backoffice', frBackoffice, arBackoffice],
  ])('%s a les mêmes clés en FR et AR', (_ns, fr, ar) => {
    expect(flatKeys(ar).sort()).toEqual(flatKeys(fr).sort())
  })
})
```

- [ ] **Step 9: Lancer le test — doit passer**

Run: `cd frontend && npm test`
Expected: PASS (smoke + parité). Si un déséquilibre de clés existe, corriger le JSON fautif.

- [ ] **Step 10: Vérifier le build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 11: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/i18n/index.js frontend/src/locales frontend/src/i18n/keyParity.test.js frontend/src/main.jsx
git commit -m "feat(i18n): coeur react-i18next (fr/ar, namespaces common+backoffice) + garde-fou de parité"
```

---

## Task 3: Direction RTL + police arabe

Ajoute les helpers de direction, applique `dir`/`lang` sur `<html>` au changement de langue, et charge la police arabe.

**Files:**
- Create: `frontend/src/i18n/rtl.js`
- Test: `frontend/src/i18n/rtl.test.js`
- Modify: `frontend/src/App.jsx` (effet de synchro direction)
- Modify: `frontend/package.json` (police)
- Modify: `frontend/tailwind.config.js` (famille de police)
- Modify: `frontend/src/assets/styles/index.css` (import police + application `[lang="ar"]`)

**Interfaces:**
- Consumes: `SUPPORTED_LANGS` de `./index` (non requis ici).
- Produces: `isRtl(lang) -> boolean`, `applyDirection(lang) -> void` (pose `document.documentElement.lang` et `dir`). Classe CSS `dir="rtl"` sur `<html>` en arabe ; famille Tailwind `font-arabic`.

- [ ] **Step 1: Écrire les tests de `rtl.js`**

Create `frontend/src/i18n/rtl.test.js` :

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { isRtl, applyDirection } from './rtl'

describe('rtl helpers', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('dir')
    document.documentElement.removeAttribute('lang')
  })

  it('isRtl vrai seulement pour ar', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('fr')).toBe(false)
  })

  it('applyDirection pose lang et dir sur <html>', () => {
    applyDirection('ar')
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    applyDirection('fr')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- rtl`
Expected: FAIL (`rtl.js` inexistant / exports manquants).

- [ ] **Step 3: Implémenter `rtl.js`**

Create `frontend/src/i18n/rtl.js` :

```js
const RTL_LANGS = ['ar']

export function isRtl(lang) {
  return RTL_LANGS.includes(lang)
}

export function applyDirection(lang) {
  const el = document.documentElement
  el.setAttribute('lang', lang)
  el.setAttribute('dir', isRtl(lang) ? 'rtl' : 'ltr')
}
```

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- rtl`
Expected: PASS.

- [ ] **Step 5: Synchroniser la direction au changement de langue**

Modify `frontend/src/App.jsx` — ajouter les imports en tête :

```js
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { applyDirection } from './i18n/rtl'
```

Puis, au tout début du composant `App` (avant le `return`), ajouter :

```js
  const { i18n } = useTranslation()
  useEffect(() => {
    applyDirection(i18n.language)
    const onChange = (lng) => applyDirection(lng)
    i18n.on('languageChanged', onChange)
    return () => i18n.off('languageChanged', onChange)
  }, [i18n])
```

(Si `App` n'a pas encore de corps de fonction avec accolades / hooks, adapter pour insérer ces lignes dans le composant racine `App`.)

- [ ] **Step 6: Installer la police arabe**

```bash
cd frontend
npm install @fontsource/noto-sans-arabic
```

- [ ] **Step 7: Déclarer la famille de police Tailwind**

Modify `frontend/tailwind.config.js` — dans `theme.extend`, ajouter :

```js
      fontFamily: {
        arabic: ['"Noto Sans Arabic"', 'sans-serif'],
      },
```

- [ ] **Step 8: Importer et appliquer la police en arabe**

Modify `frontend/src/assets/styles/index.css` — ajouter en haut (après d'éventuelles directives `@tailwind`) :

```css
@import '@fontsource/noto-sans-arabic/400.css';
@import '@fontsource/noto-sans-arabic/600.css';
@import '@fontsource/noto-sans-arabic/700.css';

html[lang='ar'] {
  font-family: 'Noto Sans Arabic', sans-serif;
}
```

- [ ] **Step 9: Vérifier build + tests**

Run: `cd frontend && npm test && npm run build`
Expected: tests PASS, `✓ built`.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/i18n/rtl.js frontend/src/i18n/rtl.test.js frontend/src/App.jsx frontend/package.json frontend/package-lock.json frontend/tailwind.config.js frontend/src/assets/styles/index.css
git commit -m "feat(i18n): direction RTL synchronisee sur <html> + police arabe Noto Sans"
```

---

## Task 4: Sélecteur de langue + wrapper d'icône directionnelle

**Files:**
- Create: `frontend/src/components/common/DirIcon.jsx`
- Create: `frontend/src/components/common/LanguageSwitcher.jsx`
- Test: `frontend/src/components/common/LanguageSwitcher.test.jsx`

**Interfaces:**
- Consumes: `i18n` (via `useTranslation`), `t('common:language.*')`.
- Produces:
  - `<DirIcon icon={FiChevronRight} className="..." />` — rend l'icône, appliquée `scaleX(-1)` en RTL.
  - `<LanguageSwitcher />` — bouton qui bascule `fr` ⇄ `ar` via `i18n.changeLanguage`, affiche le libellé de la langue **cible**.

- [ ] **Step 1: Implémenter `DirIcon`**

Create `frontend/src/components/common/DirIcon.jsx` :

```jsx
import { useTranslation } from 'react-i18next'
import { isRtl } from '../../i18n/rtl'

// Icône directionnelle : miroir horizontal en RTL (chevrons, flèches).
export default function DirIcon({ icon: Icon, className = '' }) {
  const { i18n } = useTranslation()
  const style = isRtl(i18n.language) ? { transform: 'scaleX(-1)' } : undefined
  return <Icon className={className} style={style} />
}
```

- [ ] **Step 2: Écrire le test du switcher**

Create `frontend/src/components/common/LanguageSwitcher.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import LanguageSwitcher from './LanguageSwitcher'

describe('LanguageSwitcher', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche la langue cible et bascule au clic', async () => {
    render(<LanguageSwitcher />)
    // En FR, la cible est l'arabe.
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('العربية')
    await userEvent.click(btn)
    expect(i18n.language).toBe('ar')
  })
})
```

- [ ] **Step 3: Lancer — doit échouer**

Run: `cd frontend && npm test -- LanguageSwitcher`
Expected: FAIL (`LanguageSwitcher` inexistant).

- [ ] **Step 4: Implémenter `LanguageSwitcher`**

Create `frontend/src/components/common/LanguageSwitcher.jsx` :

```jsx
import { useTranslation } from 'react-i18next'
import { FiGlobe } from 'react-icons/fi'

// Bascule fr ⇄ ar. Affiche le libellé de la langue CIBLE.
export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation('common')
  const target = i18n.language === 'ar' ? 'fr' : 'ar'
  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(target)}
      className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
      title={t(`language.${target}`)}
    >
      <FiGlobe className="w-4 h-4" />
      <span>{t(`language.${target}`)}</span>
    </button>
  )
}
```

- [ ] **Step 5: Lancer — doit passer**

Run: `cd frontend && npm test -- LanguageSwitcher`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/DirIcon.jsx frontend/src/components/common/LanguageSwitcher.jsx frontend/src/components/common/LanguageSwitcher.test.jsx
git commit -m "feat(i18n): LanguageSwitcher (fr/ar) + DirIcon (miroir RTL)"
```

---

## Task 5: Migrer la coquille back-office (BackofficeLayout)

Remplace le texte codé en dur par `t()`, monte le `LanguageSwitcher`, passe les classes directionnelles en logiques, et applique le miroir aux icônes directionnelles.

**Files:**
- Modify: `frontend/src/pages/backoffice/components/BackofficeLayout.jsx`
- Test: `frontend/src/pages/backoffice/components/BackofficeLayout.test.jsx`

**Interfaces:**
- Consumes: `t('backoffice:nav.*')`, `t('common:actions.*')`, `<LanguageSwitcher />`, `<DirIcon />`.
- Produces: coquille back-office localisée ; le tableau de nav utilise des **clés i18n** au lieu de libellés en dur.

- [ ] **Step 1: Écrire le test de rendu localisé**

Create `frontend/src/pages/backoffice/components/BackofficeLayout.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import BackofficeLayout from './BackofficeLayout'

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/backoffice']}>
      <BackofficeLayout />
    </MemoryRouter>,
  )
}

describe('BackofficeLayout i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('rend les libellés FR', () => {
    renderLayout()
    expect(screen.getAllByText('Clients').length).toBeGreaterThan(0)
  })

  it('rend les libellés AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderLayout()
    expect(screen.getAllByText('العملاء').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- BackofficeLayout`
Expected: FAIL (les libellés sont encore en dur ; `العملاء` introuvable).

- [ ] **Step 3: Migrer le tableau de navigation vers des clés**

Modify `frontend/src/pages/backoffice/components/BackofficeLayout.jsx` :

Remplacer le tableau de menu (les objets `{ section, items:[{ path, icon, label }] }`) pour utiliser des **clés i18n** : ajouter un champ `labelKey` (et `sectionKey`) au lieu de `label`/`section` en dur. Exemple pour les deux premiers groupes (appliquer le même schéma à tous) :

```jsx
const menuGroups = [
  {
    sectionKey: 'nav.sections.main',
    items: [
      { path: '/backoffice', icon: FiHome, labelKey: 'nav.dashboard', exact: true },
      { path: '/backoffice/biens', icon: FiFileText, labelKey: 'nav.properties' },
      { path: '/backoffice/pipeline', icon: FiGrid, labelKey: 'nav.pipeline' },
    ],
  },
  {
    sectionKey: 'nav.sections.crm',
    items: [
      { path: '/backoffice/clients', icon: FiUsers, labelKey: 'nav.clients' },
      { path: '/backoffice/leads', icon: FiMail, labelKey: 'nav.leads' },
      { path: '/backoffice/visites', icon: FiCalendar, labelKey: 'nav.visits' },
    ],
  },
  {
    sectionKey: 'nav.sections.finance',
    items: [
      { path: '/backoffice/transactions', icon: FiBriefcase, labelKey: 'nav.transactions' },
      { path: '/backoffice/contrats', icon: FiFileText, labelKey: 'nav.contracts' },
      { path: '/backoffice/notaires', icon: FiBriefcase, labelKey: 'nav.notaries' },
      { path: '/backoffice/artisans', icon: FiTool, labelKey: 'nav.artisans' },
      { path: '/backoffice/gestion-locative', icon: FiKey, labelKey: 'nav.rental' },
      { path: '/backoffice/boutique', icon: FiShoppingBag, labelKey: 'nav.shop' },
    ],
  },
  {
    sectionKey: 'nav.sections.admin',
    items: [
      { path: '/backoffice/equipe', icon: FiUserCheck, labelKey: 'nav.team' },
      { path: '/backoffice/analyses', icon: FiTrendingUp, labelKey: 'nav.analytics' },
      { path: '/backoffice/parametres', icon: FiSettings, labelKey: 'nav.settings' },
    ],
  },
]
```

- [ ] **Step 4: Utiliser `t()` dans le rendu + monter le switcher**

Modify `frontend/src/pages/backoffice/components/BackofficeLayout.jsx` :

En tête du fichier, ajouter :

```jsx
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../../../components/common/LanguageSwitcher'
```

Dans le composant, récupérer `t` sur le namespace `backoffice` :

```jsx
  const { t } = useTranslation('backoffice')
```

- Rendu des sections : remplacer l'affichage de `group.section` par `t(group.sectionKey)`.
- Rendu des items : remplacer `{item.label}` par `{t(item.labelKey)}`.
- Placeholder de recherche : remplacer `placeholder="Rechercher..."` par `placeholder={t('common:actions.search')}`.
- Texte « Déconnexion » (2 occurrences) : remplacer par `{t('common:actions.logout')}`.
- Monter `<LanguageSwitcher />` dans la barre supérieure (à côté de la zone profil/déconnexion en haut à droite).

- [ ] **Step 5: Passer les classes directionnelles en logiques + miroir d'icônes**

Modify `frontend/src/pages/backoffice/components/BackofficeLayout.jsx` :

- Remplacer dans ce fichier les utilitaires directionnels par leurs équivalents logiques : `ml-*→ms-*`, `mr-*→me-*`, `pl-*→ps-*`, `pr-*→pe-*`, `left-*→start-*`, `right-*→end-*`, `text-left→text-start`, `text-right→text-end`, `rounded-l*→rounded-s*`, `rounded-r*→rounded-e*`, `border-l*→border-s*`, `border-r*→border-e*`.
- Pour toute icône directionnelle (chevrons `FiChevron*`, flèches) présente dans ce fichier, l'envelopper via `DirIcon` (`import DirIcon from '../../../components/common/DirIcon'`) : remplacer `<FiChevronDown className="x" />` par `<DirIcon icon={FiChevronDown} className="x" />` **uniquement** pour les icônes qui indiquent une direction horizontale (les chevrons purement verticaux comme un accordéon peuvent rester tels quels).

- [ ] **Step 6: Lancer — doit passer**

Run: `cd frontend && npm test -- BackofficeLayout`
Expected: PASS (libellés FR et AR trouvés).

- [ ] **Step 7: Vérifier le build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/backoffice/components/BackofficeLayout.jsx frontend/src/pages/backoffice/components/BackofficeLayout.test.jsx
git commit -m "feat(i18n): coquille back-office localisee (nav/recherche/deconnexion) + switcher + logique RTL"
```

---

## Task 6: Migrer la page tableau de bord (Dashboard)

**Files:**
- Modify: `frontend/src/pages/backoffice/Dashboard.jsx`
- Test: `frontend/src/pages/backoffice/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `t('backoffice:dashboard.*')`.
- Produces: page tableau de bord localisée (surface témoin complète).

- [ ] **Step 1: Écrire le test de rendu localisé**

Create `frontend/src/pages/backoffice/Dashboard.test.jsx` :

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import i18n from '../../i18n'
import Dashboard from './Dashboard'

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Dashboard i18n', () => {
  beforeEach(async () => { await i18n.changeLanguage('fr') })

  it('affiche le sous-titre FR', () => {
    renderDashboard()
    expect(screen.getByText("Vue d'ensemble de votre activité")).toBeInTheDocument()
  })

  it('affiche le sous-titre AR après bascule', async () => {
    await i18n.changeLanguage('ar')
    renderDashboard()
    expect(screen.getByText('نظرة عامة على نشاطك')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `cd frontend && npm test -- Dashboard`
Expected: FAIL (texte AR introuvable).

- [ ] **Step 3: Migrer les chaînes de Dashboard**

Modify `frontend/src/pages/backoffice/Dashboard.jsx` :

En tête, ajouter :

```jsx
import { useTranslation } from 'react-i18next'
```

Dans le composant :

```jsx
  const { t } = useTranslation('backoffice')
```

Remplacer chaque chaîne visible par sa clé (mapping exact) :

| Texte FR actuel | Remplacer par |
|---|---|
| `Tableau de bord` (h1) | `{t('dashboard.title')}` |
| `Vue d'ensemble de votre activité` | `{t('dashboard.subtitle')}` |
| `Biens actifs` | `{t('dashboard.stats.activeProperties')}` |
| `Nouveaux leads` | `{t('dashboard.stats.newLeads')}` |
| `Visites planifiées` | `{t('dashboard.stats.plannedVisits')}` |
| `Pipeline actif` | `{t('dashboard.stats.activePipeline')}` |
| `Derniers leads` | `{t('dashboard.latestLeads')}` |
| `Aucun lead récent` | `{t('dashboard.noRecentLead')}` |
| `Prochaines visites` | `{t('dashboard.upcomingVisits')}` |
| `Aucune visite planifiée` | `{t('dashboard.noPlannedVisit')}` |
| `Résumé du mois` | `{t('dashboard.monthSummary')}` |
| `Chiffre d'affaires` | `{t('dashboard.revenue')}` |
| `Biens vendus` | `{t('dashboard.soldProperties')}` |
| `Nouveaux clients` | `{t('dashboard.newClients')}` |
| `Transactions actives` | `{t('dashboard.activeTransactions')}` |
| `Actions rapides` | `{t('dashboard.quickActions')}` |
| `Ajouter un bien` | `{t('dashboard.addProperty')}` |
| `Nouveau client` | `{t('dashboard.newClient')}` |
| `Planifier visite` | `{t('dashboard.planVisit')}` |
| `Voir le pipeline` | `{t('dashboard.viewPipeline')}` |

Pour les props `title="..."` des cartes de stats, passer `title={t('dashboard.stats.xxx')}`.

Passer aussi les classes directionnelles éventuelles de ce fichier en logiques (cf. Task 5, Step 5).

- [ ] **Step 4: Lancer — doit passer**

Run: `cd frontend && npm test -- Dashboard`
Expected: PASS.

- [ ] **Step 5: Vérifier toute la suite + build**

Run: `cd frontend && npm test && npm run build`
Expected: tous les tests PASS, `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/backoffice/Dashboard.jsx frontend/src/pages/backoffice/Dashboard.test.jsx
git commit -m "feat(i18n): page tableau de bord localisee (surface temoin complete)"
```

---

## Validation finale de la Phase 0

- [ ] `cd frontend && npm test` → tous verts (smoke, parité, rtl, LanguageSwitcher, BackofficeLayout, Dashboard).
- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] Manuel : `npm run dev`, ouvrir `/backoffice`, cliquer le switcher → la coquille + le dashboard passent en arabe, la mise en page bascule en RTL (sidebar à droite), la police arabe s'applique, le choix persiste au rechargement (localStorage `lang`). Les autres surfaces restent en FR sans casser.
