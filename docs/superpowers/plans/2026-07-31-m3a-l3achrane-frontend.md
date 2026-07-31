# M3a-L3chrane Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `frontend-m3a-l3chrane/` Vite SPA that reproduces the M3a-L3chrane roommate-marketplace design across three surfaces (public web, seeker app, partner portal) on mock data, with a semsar-shaped API seam for later live wiring.

**Architecture:** One Vite + React 18 app at repo root. Design tokens are ported verbatim from the Claude Design project; DS components are ported near-verbatim (they are already inline-style + CSS-variable ES modules — only `Icon` changes from CDN Lucide to `lucide-react`). UI-kit screens are ported into route-based surfaces, each lazy-loaded. Surfaces read data through async service functions that resolve to mock fixtures today and to the shared gateway later via one env flag.

**Tech Stack:** Vite 7, React 18, `react-router-dom` 6, `lucide-react`, `axios`, Tailwind 3 (present to match semsar; DS styling stays inline-style + token CSS, Tailwind is only for incidental surface glue), ESLint 8.

## Global Constraints

- **Location:** `frontend-m3a-l3chrane/` at repo root. Own `package.json` / `node_modules`. No imports to/from the existing `frontend/`.
- **Dev port:** `5610` (semsar uses `5600`; both must run side by side).
- **Dev proxy:** `/api` and `/uploads` → `http://localhost:8099` (same gateway as semsar).
- **Mock flag:** `VITE_USE_MOCK`, default `true`. Surfaces call async service functions only — never fixtures directly.
- **DS source of truth:** Claude Design project `7918b4a1-1afc-4f61-9807-762a645ceb81`. Fetch any DS file with the `DesignSync` tool: `method: "get_file"`, `projectId: "7918b4a1-1afc-4f61-9807-762a645ceb81"`, `path: "<path>"`. (If deferred, load it first with `ToolSearch` query `select:DesignSync`.) `uploads/layout.png` is the visual ground truth.
- **Tokens ported verbatim** — do not edit token values.
- **Faithful port** — do not redesign DS components or invent new visual language.
- **Copy rules (verbatim from spec):** French, address user as « vous », sentence case, trust-first tone. Money = `2 300 MAD /mois` (space thousands, MAD suffix, ` /mois`). French spacing: insecable (non-breaking) space before `: ; ! ?` and inside « … ». Emoji only in conversational surfaces (👋 greeting, 😊 chat), never in structural UI.
- **Hard product rule:** lifestyle described in neutral terms only (*Non-fumeur, Calme, Invités OK, Pratique religieuse : modérée*). **Never** nationality, origin, or religion labels anywhere in data or UI.
- **No secrets, no real logo reconstruction, placeholders for photography/logo.**
- **Commit style:** Conventional Commits, French subjects consistent with repo history (e.g. `feat(m3a): …`). No AI attribution trailers.
- **Branch:** `feature/m3a-l3achrane-frontend` (already created; the spec is committed there).

---

### Task 1: Scaffold the app

**Files:**
- Create: `frontend-m3a-l3chrane/package.json`
- Create: `frontend-m3a-l3chrane/vite.config.js`
- Create: `frontend-m3a-l3chrane/postcss.config.js`
- Create: `frontend-m3a-l3chrane/tailwind.config.js`
- Create: `frontend-m3a-l3chrane/.eslintrc.cjs`
- Create: `frontend-m3a-l3chrane/.gitignore`
- Create: `frontend-m3a-l3chrane/index.html`
- Create: `frontend-m3a-l3chrane/.env.development`
- Create: `frontend-m3a-l3chrane/src/main.jsx`
- Create: `frontend-m3a-l3chrane/src/App.jsx` (temporary hello page, replaced in Task 11)
- Modify: root `Makefile` (add m3a targets)
- Modify: root `.gitignore` (ignore the new app's node_modules/dist)

**Interfaces:**
- Produces: a bootable Vite app on port 5610; `src/App.jsx` default export mounted by `main.jsx`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "m3a-l3chrane-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext js,jsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "axios": "^1.6.2",
    "lucide-react": "^0.400.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "vite": "^7.3.1"
  }
}
```

- [ ] **Step 2: Create `vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5610,
    proxy: {
      '/api': { target: 'http://localhost:8099', changeOrigin: true },
      '/uploads': { target: 'http://localhost:8099', changeOrigin: true },
    },
  },
  resolve: { alias: { '@': '/src' } },
})
```

- [ ] **Step 3: Create `postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 4: Create `tailwind.config.js`** (minimal — DS uses token CSS; Tailwind is incidental glue)

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: 'var(--brand-primary)',
        gold: 'var(--brand-accent)',
        verified: 'var(--verified)',
      },
      fontFamily: { display: 'var(--font-display)', body: 'var(--font-body)' },
    },
  },
  plugins: [],
}
```

- [ ] **Step 5: Create `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/prop-types': 'off',
  },
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules
dist
.env.local
*.log
```

- [ ] **Step 7: Create `.env.development`**

```
VITE_USE_MOCK=true
```

- [ ] **Step 8: Create `index.html`** (Lucide CDN is NOT used — icons come from lucide-react)

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>M3a-L3chrane — Colocation vérifiée au Maroc</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Create `src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 10: Create temporary `src/App.jsx`** (replaced in Task 11) and a minimal styles entry so the import in Step 9 resolves

`src/App.jsx`:
```jsx
export default function App() {
  return <div style={{ padding: 40, fontFamily: 'system-ui' }}>M3a-L3chrane — scaffold OK</div>
}
```

`src/styles/styles.css` (placeholder, replaced verbatim in Task 2):
```css
/* replaced in Task 2 with the ported token entry */
```

- [ ] **Step 11: Add root Makefile targets**

Read the existing root `Makefile` first to match its style, then append:
```makefile
m3a-install:
	cd frontend-m3a-l3chrane && npm install

m3a-dev:
	cd frontend-m3a-l3chrane && npm run dev

m3a-build:
	cd frontend-m3a-l3chrane && npm run build

m3a-lint:
	cd frontend-m3a-l3chrane && npm run lint
```

- [ ] **Step 12: Install and boot**

Run: `cd frontend-m3a-l3chrane && npm install && npm run build`
Expected: install succeeds; `vite build` produces `dist/` with no errors.

Run: `npm run dev` (background), then `curl -s -o /dev/null -w "%{http_code}" http://localhost:5610/`
Expected: `200`. Stop the dev server.

- [ ] **Step 13: Commit**

```bash
git add frontend-m3a-l3chrane Makefile .gitignore
git commit -m "chore(m3a): scaffold frontend Vite + configs + Makefile targets"
```

---

### Task 2: Port design tokens (verbatim)

**Files:**
- Create: `frontend-m3a-l3chrane/src/styles/tokens/fonts.css`
- Create: `frontend-m3a-l3chrane/src/styles/tokens/colors.css`
- Create: `frontend-m3a-l3chrane/src/styles/tokens/typography.css`
- Create: `frontend-m3a-l3chrane/src/styles/tokens/spacing.css`
- Create: `frontend-m3a-l3chrane/src/styles/tokens/effects.css`
- Modify: `frontend-m3a-l3chrane/src/styles/styles.css`

**Interfaces:**
- Produces: all CSS custom properties (`--brand-primary`, `--gold-500`, `--radius-sm`, `--shadow-xs`, `--font-display`, `--dur-fast`, `--ease-standard`, …) available globally. Every DS component depends on these.

- [ ] **Step 1: Download each token file verbatim**

For each `path` in `tokens/fonts.css`, `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/effects.css`: call `DesignSync get_file` (projectId `7918b4a1-1afc-4f61-9807-762a645ceb81`) and write the returned `content` **unchanged** to the matching `src/styles/tokens/<file>`.

Note: `tokens/fonts.css` loads Plus Jakarta Sans + Tajawal from a CDN `@import` — keep as-is (substitution, flagged). Do not alter values in any token file.

- [ ] **Step 2: Write the styles entry `src/styles/styles.css`**

```css
/* M3a-L3chrane — global CSS entry point. */
@import "./tokens/fonts.css";
@import "./tokens/colors.css";
@import "./tokens/typography.css";
@import "./tokens/spacing.css";
@import "./tokens/effects.css";

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--bg-page);
  color: var(--text-body);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}
a { color: var(--link); text-decoration: none; }
a:hover { color: var(--link-hover); }
```

- [ ] **Step 3: Verify tokens resolve**

Add to the temporary `App.jsx` a probe: `<div style={{ background: 'var(--brand-primary)', color: '#fff', padding: 12 }}>navy</div>`.
Run `npm run dev`, load `http://localhost:5610/`, confirm the box renders navy (`#1b2a52`). Then revert the probe. (This is a manual visual check; no automated test.)

- [ ] **Step 4: Commit**

```bash
git add frontend-m3a-l3chrane/src/styles
git commit -m "feat(m3a): tokens de design portés verbatim (couleurs, type, espacement, effets)"
```

---

### Task 3: Port core DS components

**Files:**
- Create: `frontend-m3a-l3chrane/src/ds/core/Icon.jsx` (converted)
- Create: `frontend-m3a-l3chrane/src/ds/core/{Button,IconButton,Badge,Chip,Avatar,Card,Input,Select,Tabs}.jsx` (near-verbatim)
- Create: `frontend-m3a-l3chrane/src/ds/core/index.js`

**Interfaces:**
- Produces: `Button`, `IconButton`, `Icon`, `Badge`, `Chip`, `Avatar`, `Card`, `Input`, `Select`, `Tabs` as named ES exports. `Icon` prop contract stays `{ name, size, strokeWidth, color, style }` (Lucide icon names, kebab-case, e.g. `"map-pin"`).

**Component port recipe (applies to this task and Task 4):**
1. Fetch the component source with `DesignSync get_file` (e.g. `path: "components/core/Button.jsx"`).
2. These files are already ES modules using `import React` + inline `style={}` with `var(--…)`. Write them **unchanged** EXCEPT the two rules below.
3. **Icon rule:** any `import { Icon } from "./Icon.jsx"` stays; the CDN Lucide dependency lives only inside `Icon.jsx` and is replaced there (Step 1 below). No other component references `window.lucide`.
4. **No Tailwind conversion, no restyle.** Keep inline styles and token variables exactly.
5. Verify prop names/variants against the component's `.d.ts` (fetch `components/core/<Name>.d.ts`) — the port must not drop or rename props.

- [ ] **Step 1: Convert `Icon.jsx` to lucide-react**

The DS `Icon` renders `<i data-lucide>` and hydrates via `window.lucide` (CDN). Replace with a `lucide-react` wrapper preserving the prop contract. Lucide icon names are kebab-case; `lucide-react` exports PascalCase — map with `dynamicIconImports` or the `icons` registry.

Create `src/ds/core/Icon.jsx`:
```jsx
import { icons } from 'lucide-react'

// kebab-case ("map-pin") -> PascalCase ("MapPin") to index lucide-react's registry
function toPascal(name) {
  return name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

export function Icon({ name = 'circle', size = 20, strokeWidth = 2, color = 'currentColor', style, ...rest }) {
  const Cmp = icons[toPascal(name)] || icons.Circle
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      style={{ display: 'inline-flex', ...style }}
      {...rest}
    />
  )
}
```

- [ ] **Step 2: Port the remaining core components near-verbatim**

For each of `Button, IconButton, Badge, Chip, Avatar, Card, Input, Select, Tabs`: fetch `components/core/<Name>.jsx`, write to `src/ds/core/<Name>.jsx` applying the recipe. (Example verified: `Button.jsx` imports `Icon` from `./Icon.jsx` and uses inline styles with `--brand-primary` etc. — copy as-is.)

- [ ] **Step 3: Create `src/ds/core/index.js`**

```js
export { Button } from './Button.jsx'
export { IconButton } from './IconButton.jsx'
export { Icon } from './Icon.jsx'
export { Badge } from './Badge.jsx'
export { Chip } from './Chip.jsx'
export { Avatar } from './Avatar.jsx'
export { Card } from './Card.jsx'
export { Input } from './Input.jsx'
export { Select } from './Select.jsx'
export { Tabs } from './Tabs.jsx'
```

- [ ] **Step 4: Verify components render**

Temporarily render a gallery in `App.jsx`:
```jsx
import { Button, Badge, Icon, Card } from './ds/core/index.js'
export default function App() {
  return (
    <div style={{ padding: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Button variant="primary">Se connecter</Button>
      <Button variant="accent">S'inscrire</Button>
      <Badge>Vérifiée</Badge>
      <Icon name="map-pin" />
      <Card><div style={{ padding: 16 }}>Carte</div></Card>
    </div>
  )
}
```
Run `npm run dev`, load `/`, confirm buttons/badge/icon/card render with navy+gold styling and the `map-pin` icon appears. Run `npm run build` — must succeed. Then revert `App.jsx` to the scaffold hello. (Manual visual check.)

- [ ] **Step 5: Commit**

```bash
git add frontend-m3a-l3chrane/src/ds/core
git commit -m "feat(m3a): composants DS core portés (Icon → lucide-react)"
```

---

### Task 4: Port trust, listing, and nav DS components

**Files:**
- Create: `frontend-m3a-l3chrane/src/ds/trust/{VerifiedBadge,MatchScore,CompatibilityRing,FeatureItem}.jsx`
- Create: `frontend-m3a-l3chrane/src/ds/listing/{ListingCard,PriceTag,AmenityChip}.jsx`
- Create: `frontend-m3a-l3chrane/src/ds/nav/{SidebarNav,TopBar}.jsx`
- Create: `frontend-m3a-l3chrane/src/ds/trust/index.js`, `.../listing/index.js`, `.../nav/index.js`
- Create: `frontend-m3a-l3chrane/src/ds/index.js` (top barrel)

**Interfaces:**
- Consumes: `src/ds/core/*` (these components import from `../core`).
- Produces: `VerifiedBadge`, `MatchScore`, `CompatibilityRing`, `FeatureItem`, `ListingCard`, `PriceTag`, `AmenityChip`, `SidebarNav`, `TopBar` as named exports, plus a single `src/ds/index.js` re-exporting the entire DS.

- [ ] **Step 1: Port trust/listing/nav components**

Apply the Task 3 port recipe to each file: fetch `components/trust/<Name>.jsx`, `components/listing/<Name>.jsx`, `components/nav/<Name>.jsx`; write near-verbatim to the matching `src/ds/<group>/<Name>.jsx`. Fix intra-DS import paths only if they reference a global namespace: if any file reads `window.M3aL3chraneDesignSystem_7918b4`, replace those with ES imports from `../core/index.js` (or sibling). Verify each against its `.d.ts`.

- [ ] **Step 2: Create per-group barrels**

`src/ds/trust/index.js`:
```js
export { VerifiedBadge } from './VerifiedBadge.jsx'
export { MatchScore } from './MatchScore.jsx'
export { CompatibilityRing } from './CompatibilityRing.jsx'
export { FeatureItem } from './FeatureItem.jsx'
```
`src/ds/listing/index.js`:
```js
export { ListingCard } from './ListingCard.jsx'
export { PriceTag } from './PriceTag.jsx'
export { AmenityChip } from './AmenityChip.jsx'
```
`src/ds/nav/index.js`:
```js
export { SidebarNav } from './SidebarNav.jsx'
export { TopBar } from './TopBar.jsx'
```

- [ ] **Step 3: Create top barrel `src/ds/index.js`**

```js
export * from './core/index.js'
export * from './trust/index.js'
export * from './listing/index.js'
export * from './nav/index.js'
```

- [ ] **Step 4: Verify build**

Temporarily import a `ListingCard`, `CompatibilityRing`, and `TopBar` into `App.jsx` with minimal props, run `npm run dev`, confirm they render, run `npm run build` (must succeed), then revert `App.jsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend-m3a-l3chrane/src/ds
git commit -m "feat(m3a): composants DS trust/listing/nav + barrels"
```

---

### Task 5: Formatting helpers (`lib/format.js`) — TDD

**Files:**
- Create: `frontend-m3a-l3chrane/src/lib/format.js`
- Create: `frontend-m3a-l3chrane/src/lib/format.test.mjs`
- Modify: `frontend-m3a-l3chrane/package.json` (add a `test` script using Node's built-in test runner)

**Interfaces:**
- Produces:
  - `formatMad(amount: number): string` → `"2 300 MAD /mois"` uses a non-breaking space (U+00A0) for thousands and before `MAD` and `/mois`. Base form: `formatMad(2300)` → `2 300 MAD /mois`. Overload `formatMad(amount, { suffix: false })` drops ` /mois`.
  - `frenchPunct(text: string): string` → inserts a non-breaking space before `: ; ! ?` when missing.
  - `matchTone(pct: number): 'strong' | 'normal'` → `'strong'` when `pct >= 80`.

- [ ] **Step 1: Add test script to `package.json`**

Add to `"scripts"`: `"test": "node --test"`.

- [ ] **Step 2: Write the failing tests `src/lib/format.test.mjs`**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMad, frenchPunct, matchTone } from './format.js'

const NB = ' '

test('formatMad spaces thousands and appends /mois with nbsp', () => {
  assert.equal(formatMad(2300), `2${NB}300${NB}MAD${NB}/mois`)
  assert.equal(formatMad(950), `950${NB}MAD${NB}/mois`)
  assert.equal(formatMad(12000), `12${NB}000${NB}MAD${NB}/mois`)
})

test('formatMad without suffix drops /mois', () => {
  assert.equal(formatMad(2300, { suffix: false }), `2${NB}300${NB}MAD`)
})

test('frenchPunct inserts nbsp before : ; ! ?', () => {
  assert.equal(frenchPunct('Pratique religieuse : modérée'), `Pratique religieuse${NB}: modérée`)
  assert.equal(frenchPunct('Vraiment ?'), `Vraiment${NB}?`)
})

test('matchTone strong at >= 80', () => {
  assert.equal(matchTone(85), 'strong')
  assert.equal(matchTone(80), 'strong')
  assert.equal(matchTone(79), 'normal')
})
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `cd frontend-m3a-l3chrane && npm test`
Expected: FAIL — `format.js` has no such exports.

- [ ] **Step 4: Implement `src/lib/format.js`**

```js
const NB = ' '

export function formatMad(amount, { suffix = true } = {}) {
  const grouped = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, NB)
  const base = `${grouped}${NB}MAD`
  return suffix ? `${base}${NB}/mois` : base
}

export function frenchPunct(text) {
  return text.replace(/\s*([:;!?])/g, `${NB}$1`)
}

export function matchTone(pct) {
  return pct >= 80 ? 'strong' : 'normal'
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `cd frontend-m3a-l3chrane && npm test`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend-m3a-l3chrane/src/lib frontend-m3a-l3chrane/package.json
git commit -m "feat(m3a): helpers format MAD + ponctuation française (TDD)"
```

---

### Task 6: Data seam — API client, services, mock fixtures

**Files:**
- Create: `frontend-m3a-l3chrane/src/services/api.js`
- Create: `frontend-m3a-l3chrane/src/services/index.js`
- Create: `frontend-m3a-l3chrane/src/data/{listings,profiles,partners,messages}.js`
- Create: `frontend-m3a-l3chrane/src/data/index.js`

**Interfaces:**
- Produces async service functions (always return Promises, whether mock or live):
  - `listListings(filters?): Promise<Listing[]>`
  - `getListing(id): Promise<Listing | null>`
  - `getCurrentProfile(): Promise<Profile>`
  - `listPartners(): Promise<Partner[]>`
  - `listThreads(): Promise<Thread[]>`
- `Listing` shape (used by ListingCard + detail + search): `{ id, titre, ville, quartier, prixMad, photos: string[], matchPct, verifiee, chips: string[], colocataires: {nom, avatar}[], description, equipements: string[], facts: {label, value}[] }`.
- `Profile`: `{ prenom, avatar, verifiee, lifestyle: string[], recherche: {ville, budgetMad, dispo} }` (lifestyle strings are neutral only).
- `Partner`: `{ id, nom, type, logo, verifies, quota }`.
- `Thread`: `{ id, nom, avatar, dernier, heure, messages: {mine:boolean, texte, heure}[] }`.

- [ ] **Step 1: Create `src/services/api.js`** (mirrors semsar `frontend/src/services/api.js`)

```js
import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh']
const isAuthPath = (url = '') => AUTH_PATHS.some((p) => url.includes(p))

api.interceptors.request.use((config) => {
  if (isAuthPath(config.url)) return config
  const raw = localStorage.getItem('auth-storage')
  if (raw) {
    const { state } = JSON.parse(raw)
    if (state?.accessToken) config.headers.Authorization = `Bearer ${state.accessToken}`
  }
  return config
})

export default api
```

- [ ] **Step 2: Create mock fixtures**

Create `src/data/listings.js` exporting a `listings` array of ~9 objects following the `Listing` shape. Rules: realistic Moroccan cities/quartiers (Casablanca–Maârif, Rabat–Agdal, Marrakech–Guéliz, …), `prixMad` between 950 and 4200, `matchPct` 62–94, mix of `verifiee` true/false, `photos` as placeholder strings like `'/uploads/placeholder-1.jpg'`, `chips`/`equipements` from a neutral set (`Wifi, Meublé, Proche fac, Non-fumeur, Calme, Invités OK, Cuisine équipée`). Provide `facts` (e.g. `{label:'Chambres', value:'3'}`), a short French `description`, and 1–3 `colocataires` with `nom` + placeholder `avatar`. **No** nationality/origin/religion fields.

Create `src/data/profiles.js` exporting `currentProfile` (a `Profile`, e.g. `prenom: 'Yassine'`, neutral `lifestyle: ['Non-fumeur','Calme','Invités OK','Pratique religieuse : modérée']`).

Create `src/data/partners.js` exporting `partners` (~5 `Partner`: universities/employers, `type: 'Université' | 'École' | 'Employeur'`, `verifies` count, `quota`).

Create `src/data/messages.js` exporting `threads` (~4 `Thread` with 3–6 messages each; a 😊 allowed inside a bubble, never elsewhere).

Create `src/data/index.js`:
```js
export { listings } from './listings.js'
export { currentProfile } from './profiles.js'
export { partners } from './partners.js'
export { threads } from './messages.js'
```

- [ ] **Step 3: Create `src/services/index.js`** (mock/live switch)

```js
import api from './api.js'
import { listings, currentProfile, partners, threads } from '../data/index.js'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120)) // mimic async

export async function listListings(filters = {}) {
  if (USE_MOCK) {
    let out = listings
    if (filters.ville) out = out.filter((l) => l.ville === filters.ville)
    return delay(out)
  }
  const { data } = await api.get('/listings', { params: filters })
  return data
}

export async function getListing(id) {
  if (USE_MOCK) return delay(listings.find((l) => String(l.id) === String(id)) || null)
  const { data } = await api.get(`/listings/${id}`)
  return data
}

export async function getCurrentProfile() {
  if (USE_MOCK) return delay(currentProfile)
  const { data } = await api.get('/me/profile')
  return data
}

export async function listPartners() {
  if (USE_MOCK) return delay(partners)
  const { data } = await api.get('/partners')
  return data
}

export async function listThreads() {
  if (USE_MOCK) return delay(threads)
  const { data } = await api.get('/messages/threads')
  return data
}
```

- [ ] **Step 4: Verify**

Run: `cd frontend-m3a-l3chrane && npm run build`
Expected: build succeeds (imports resolve, no unused-var lint failures under build). Run `npm run lint` — clean.

- [ ] **Step 5: Commit**

```bash
git add frontend-m3a-l3chrane/src/services frontend-m3a-l3chrane/src/data
git commit -m "feat(m3a): seam data (api.js semsar-shaped) + services mock + fixtures"
```

---

### Task 7: Web surface — layout shell + Landing

**Files:**
- Create: `frontend-m3a-l3chrane/src/surfaces/web/WebLayout.jsx`
- Create: `frontend-m3a-l3chrane/src/surfaces/web/Landing.jsx`

**Interfaces:**
- Consumes: `TopBar` from `ds/nav`, `Button`/`Card`/`Icon`/`Badge` from `ds/core`, `FeatureItem` from `ds/trust`, `formatMad` from `lib/format`. React Router `<Outlet>`, `<Link>`.
- Produces: `WebLayout` (default export) with navy TopBar + `<Outlet/>` + footer; `Landing` (default export).

**Porting source:** the web kit screens live in `ui_kits/web/screens.jsx` (fetch via `DesignSync get_file`). Port the landing screen from there. Transform rules:
1. Replace any `const { X } = window.M3aL3chraneDesignSystem_7918b4` destructuring with ES imports from `../../ds/index.js`.
2. Replace inline kit demo data with our fixtures/services where relevant (the landing is mostly static marketing; keep its copy verbatim — it already follows the French/trust rules).
3. Replace kit-internal navigation (state toggles between screens) with router `<Link>`/`useNavigate` to `/recherche` and `/annonce/:id`.
4. Keep inline styles + tokens; do not restyle.

- [ ] **Step 1: Create `WebLayout.jsx`**

```jsx
import { Outlet, Link } from 'react-router-dom'
import { TopBar } from '../../ds/index.js'

export default function WebLayout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <footer style={{ background: 'var(--surface-navy-deep)', color: 'var(--text-on-navy-muted)', padding: '40px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          <div>M3a-L3chrane — Colocation vérifiée au Maroc</div>
          <nav style={{ display: 'flex', gap: 20 }}>
            <Link to="/recherche" style={{ color: 'inherit' }}>Rechercher</Link>
            <Link to="/espace" style={{ color: 'inherit' }}>Mon espace</Link>
            <Link to="/partenaire" style={{ color: 'inherit' }}>Partenaires</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
```

Note: if the ported `TopBar` needs nav links as props, pass French labels (`Rechercher`, `Se connecter`, `S'inscrire`) wired to router links per its `.d.ts`.

- [ ] **Step 2: Create `Landing.jsx`**

Fetch `ui_kits/web/screens.jsx`, extract the landing screen, apply the transform rules above, and write `Landing.jsx` as a default-export component. It must include, matching `uploads/layout.png`: split hero (headline with gold *confiance* highlight + role toggle + search box with Colocations/Résidences tabs), three mini trust props, trust band, 5-step « Comment ça marche », partner logo row, navy partner-CTA block. The search box's *Rechercher* button calls `useNavigate()('/recherche')`.

- [ ] **Step 3: Wire a temporary route to view it**

Temporarily set `App.jsx` to render `<BrowserRouter><WebLayout/> with Landing` (or a direct `<Landing/>` inside a Router) to visually verify. Run `npm run dev`, load `/`, compare against `uploads/layout.png` (hero, trust props, steps, partner block). Run `npm run build`. Revert `App.jsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend-m3a-l3chrane/src/surfaces/web
git commit -m "feat(m3a): surface web — WebLayout + Landing"
```

---

### Task 8: Web surface — SearchResults + ListingDetail

**Files:**
- Create: `frontend-m3a-l3chrane/src/surfaces/web/SearchResults.jsx`
- Create: `frontend-m3a-l3chrane/src/surfaces/web/ListingDetail.jsx`

**Interfaces:**
- Consumes: `listListings`, `getListing` from `services`; `ListingCard`, `AmenityChip`, `PriceTag` from `ds/listing`; `VerifiedBadge`, `MatchScore` from `ds/trust`; `Button`, `Card`, `Avatar`, `Icon` from `ds/core`; `formatMad` from `lib/format`; router `useParams`, `useNavigate`, `Link`.
- Produces: `SearchResults` (default export), `ListingDetail` (default export).

**Porting source:** search + detail screens in `ui_kits/web/screens.jsx`.

- [ ] **Step 1: Create `SearchResults.jsx`**

Load listings via `listListings` in a `useEffect` + `useState` (data is async). Render the kit's filter bar + sort + filter chips above a 3-column grid of `ListingCard`. Each card links to `/annonce/${id}` (router `Link` or card `onClick` → `useNavigate`). Empty result → a calm French empty state (« Aucune annonce ne correspond à votre recherche. »). Skeleton pattern:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListingCard } from '../../ds/index.js'
import { listListings } from '../../services/index.js'

export default function SearchResults() {
  const [items, setItems] = useState(null)
  const navigate = useNavigate()
  useEffect(() => { listListings().then(setItems) }, [])
  if (items === null) return <div style={{ padding: 48, maxWidth: 1200, margin: '0 auto' }}>Chargement…</div>
  // …filter bar + grid of ListingCard, each onClick={() => navigate(`/annonce/${it.id}`)}
}
```
Fill the filter bar/grid markup from the ported kit screen (keep styles/tokens), mapping `items` into `ListingCard` props.

- [ ] **Step 2: Create `ListingDetail.jsx`**

Read `:id` via `useParams`, load with `getListing(id)`. Unknown id → « Annonce introuvable » with a link back to `/recherche`. Render gallery (placeholder photos), title + `PriceTag` + `VerifiedBadge`, facts row, amenities (`AmenityChip`), description, current-roommate `Avatar`s, and a sticky contact + escrow-reassurance `Card` (« Paiement sécurisé », « Un cadre clair pour tous »). Port markup from the kit detail screen.

- [ ] **Step 3: Verify**

Temporarily wire routes `/recherche` and `/annonce/:id`, run `npm run dev`, click a card from search → detail, test an unknown id (`/annonce/999`) → not-found state. Run `npm run build`. Revert temporary wiring.

- [ ] **Step 4: Commit**

```bash
git add frontend-m3a-l3chrane/src/surfaces/web
git commit -m "feat(m3a): surface web — SearchResults + ListingDetail"
```

---

### Task 9: Seeker app surface — layout + Dashboard + Messaging

**Files:**
- Create: `frontend-m3a-l3chrane/src/surfaces/app/AppLayout.jsx`
- Create: `frontend-m3a-l3chrane/src/surfaces/app/Dashboard.jsx`
- Create: `frontend-m3a-l3chrane/src/surfaces/app/Messaging.jsx`

**Interfaces:**
- Consumes: `SidebarNav` from `ds/nav`; `getCurrentProfile`, `listListings`, `listThreads` from `services`; `CompatibilityRing`, `MatchScore`, `VerifiedBadge` from `ds/trust`; `ListingCard` from `ds/listing`; core components; router `<Outlet>`, `<Link>`, `useLocation`.
- Produces: `AppLayout` (default export, fixed 248px navy sidebar + light canvas + `<Outlet/>`), `Dashboard` (default export), `Messaging` (default export).

**Porting source:** `ui_kits/app/screens.jsx`.

- [ ] **Step 1: Create `AppLayout.jsx`**

Fixed navy `SidebarNav` (width 248px) on the left, light content canvas on the right containing `<Outlet/>`. Sidebar items link to `/espace` (Tableau de bord) and `/espace/messages` (Messages); mark the active item via `useLocation`. Pass items per `SidebarNav`'s `.d.ts`.

```jsx
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SidebarNav } from '../../ds/index.js'

export default function AppLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const items = [
    { icon: 'home', label: 'Tableau de bord', to: '/espace' },
    { icon: 'message-circle', label: 'Messages', to: '/espace/messages' },
  ]
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <SidebarNav
        items={items}
        active={pathname}
        onSelect={(to) => navigate(to)}
      />
      <div style={{ flex: 1, background: 'var(--bg-page)' }}>
        <Outlet />
      </div>
    </div>
  )
}
```
Adapt the `SidebarNav` props to whatever its ported `.d.ts` declares (e.g. it may take `active` by label; match the real contract).

- [ ] **Step 2: Create `Dashboard.jsx`**

Load profile + recommended listings (`getCurrentProfile`, `listListings`). Render greeting « Bonjour Yassine 👋 » (emoji allowed here), a « Voici un aperçu de votre recherche » subtitle, a `CompatibilityRing` (animates its sweep once on load per DS), and a grid of recommended `ListingCard`s with `MatchScore`. Port layout from the app kit.

- [ ] **Step 3: Create `Messaging.jsx`**

Load `listThreads()`. Two-pane: thread list (left) + active conversation (right) with chat bubbles; `mine` bubbles navy-aligned right, others left; 😊 allowed inside bubbles. Select a thread via local state.

- [ ] **Step 4: Verify**

Temporarily wire `/espace` and `/espace/messages`, run `npm run dev`, confirm the navy sidebar layout, dashboard greeting/ring, and messaging panes render; the compatibility ring animates once. Run `npm run build`. Revert.

- [ ] **Step 5: Commit**

```bash
git add frontend-m3a-l3chrane/src/surfaces/app
git commit -m "feat(m3a): surface app — AppLayout + Dashboard + Messaging"
```

---

### Task 10: Partner surface — layout + PartnerPortal

**Files:**
- Create: `frontend-m3a-l3chrane/src/surfaces/partner/PartnerLayout.jsx`
- Create: `frontend-m3a-l3chrane/src/surfaces/partner/PartnerPortal.jsx`

**Interfaces:**
- Consumes: `SidebarNav`/`TopBar` per the partner kit; `listPartners` from `services`; `VerifiedBadge`, `Badge`, `Card`, `Tabs`, `Avatar` from DS.
- Produces: `PartnerLayout` (default export), `PartnerPortal` (default export).

**Porting source:** `ui_kits/partner/screens.jsx`.

- [ ] **Step 1: Create `PartnerLayout.jsx`**

Follow the partner kit's shell (per `ui_kits/partner/README.md`). If it uses the same navy sidebar pattern as the app, mirror `AppLayout` with partner nav items (Roster, Vérifications, Quotas/Reporting); otherwise follow the kit. `<Outlet/>` for content.

- [ ] **Step 2: Create `PartnerPortal.jsx`**

Load `listPartners()`. Render the institutional partner space: roster table (members + verification status via `VerifiedBadge`), verification counts, quota/reporting cards. Use `Tabs` if the kit organizes sections that way. Port markup from `ui_kits/partner/screens.jsx` applying the Task 7 transform rules (globals → ES imports, kit data → `listPartners()`).

- [ ] **Step 3: Verify**

Temporarily wire `/partenaire`, run `npm run dev`, confirm the portal renders with roster + verification + quota sections. Run `npm run build`. Revert.

- [ ] **Step 4: Commit**

```bash
git add frontend-m3a-l3chrane/src/surfaces/partner
git commit -m "feat(m3a): surface partner — PartnerLayout + PartnerPortal"
```

---

### Task 11: Router wiring, surface switcher, 404, final gate

**Files:**
- Modify: `frontend-m3a-l3chrane/src/App.jsx` (replace scaffold with the real router)
- Create: `frontend-m3a-l3chrane/src/surfaces/NotFound.jsx`
- Create: `frontend-m3a-l3chrane/src/surfaces/SurfaceSwitcher.jsx`
- Create: `frontend-m3a-l3chrane/README.md`

**Interfaces:**
- Consumes: all layouts + screens (lazy). Produces the mounted app.

- [ ] **Step 1: Create `NotFound.jsx`**

```jsx
import { Link } from 'react-router-dom'
export default function NotFound() {
  return (
    <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center' }}>
      <h1 style={{ color: 'var(--text-heading)' }}>Page introuvable</h1>
      <p>La page que vous cherchez n’existe pas.</p>
      <Link to="/">Retour à l’accueil</Link>
    </div>
  )
}
```

- [ ] **Step 2: Create `SurfaceSwitcher.jsx`** (dev aid to jump between surfaces without auth)

A small fixed-position bar with `<Link>`s to `/`, `/recherche`, `/espace`, `/partenaire`. Keep it visually unobtrusive (bottom-right pill). It exists because there is no real auth in this build.

- [ ] **Step 3: Replace `src/App.jsx` with the lazy router**

```jsx
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SurfaceSwitcher from './surfaces/SurfaceSwitcher.jsx'

const WebLayout = lazy(() => import('./surfaces/web/WebLayout.jsx'))
const Landing = lazy(() => import('./surfaces/web/Landing.jsx'))
const SearchResults = lazy(() => import('./surfaces/web/SearchResults.jsx'))
const ListingDetail = lazy(() => import('./surfaces/web/ListingDetail.jsx'))
const AppLayout = lazy(() => import('./surfaces/app/AppLayout.jsx'))
const Dashboard = lazy(() => import('./surfaces/app/Dashboard.jsx'))
const Messaging = lazy(() => import('./surfaces/app/Messaging.jsx'))
const PartnerLayout = lazy(() => import('./surfaces/partner/PartnerLayout.jsx'))
const PartnerPortal = lazy(() => import('./surfaces/partner/PartnerPortal.jsx'))
const NotFound = lazy(() => import('./surfaces/NotFound.jsx'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ padding: 48 }}>Chargement…</div>}>
        <Routes>
          <Route element={<WebLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/recherche" element={<SearchResults />} />
            <Route path="/annonce/:id" element={<ListingDetail />} />
          </Route>
          <Route path="/espace" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="messages" element={<Messaging />} />
          </Route>
          <Route path="/partenaire" element={<PartnerLayout />}>
            <Route index element={<PartnerPortal />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <SurfaceSwitcher />
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Create `README.md`**

Document: what the app is, `npm install`/`npm run dev` (port 5610), `VITE_USE_MOCK`, the shared-gateway proxy, the surface routes, and the flagged substitutions (fonts/icons/photos/logo). Note the DS provenance (Claude Design project) and that tokens/components are ported.

- [ ] **Step 5: Full verification gate**

Run all and confirm each:
- `cd frontend-m3a-l3chrane && npm run lint` → clean (0 warnings).
- `npm test` → 4 passing (format helpers).
- `npm run build` → succeeds; inspect `dist/assets` shows multiple JS chunks (lazy split per surface).
- `npm run dev` (background), then check each route returns 200 and renders without console errors:
  `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5610/` and repeat for `/recherche`, `/annonce/1`, `/espace`, `/espace/messages`, `/partenaire`. (Vite serves index for client routes; verify actual render in a browser too, comparing landing/listing/dashboard/partner against `uploads/layout.png`.)
- Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add frontend-m3a-l3chrane/src/App.jsx frontend-m3a-l3chrane/src/surfaces/NotFound.jsx frontend-m3a-l3chrane/src/surfaces/SurfaceSwitcher.jsx frontend-m3a-l3chrane/README.md
git commit -m "feat(m3a): routeur lazy 3 surfaces + 404 + switcher + README"
```

---

## Notes for the implementer

- **Fetching DS files:** every `components/*`, `tokens/*`, and `ui_kits/*/screens.jsx` file is read from Claude Design via `DesignSync get_file` with projectId `7918b4a1-1afc-4f61-9807-762a645ceb81`. Do not hand-invent component internals — port the real source.
- **The only DS behavioral change is `Icon`** (CDN Lucide → `lucide-react`). Everything else is copied with import-path fixes only.
- **Async everywhere at the surface boundary:** services return Promises even in mock mode, so components use `useEffect`+`useState` (or a loader), keeping the live-wiring swap a no-op for surfaces.
- **Copy & product rules are non-negotiable** (French/vous/sentence-case, MAD format, neutral lifestyle only, emoji only in conversational surfaces).
- If a ported component's real prop contract differs from a snippet in this plan (e.g. `SidebarNav`/`TopBar` prop names), follow the component's actual `.d.ts` — the snippets show intent, the `.d.ts` is authoritative.
