# M3a-L3chrane — Frontend (design spec)

**Date:** 2026-07-31
**Status:** Approved for planning
**Owner:** frontend

## 1. Purpose

Build a **separate, standalone frontend** for **M3a-L3chrane** (معَ العشران — "avec les
colocataires"), a verified roommate / co-living marketplace for Morocco. It is fully
independent from the existing `frontend/` (semsar) app and is driven entirely by the
**M3a-L3chrane Design System** imported from Claude Design
(project `7918b4a1-1afc-4f61-9807-762a645ceb81`), whose visual ground truth is
`uploads/layout.png`.

This build ships **mock data** for every surface, but M3a-L3chrane is **not a throwaway
standalone**: it runs on **its own domain** while sharing the **same backend, gateway, and
infrastructure as SemsarOut**. So the data layer is built as a real seam that mirrors the
semsar frontend's API client exactly — mock fixtures sit *behind* that seam today and are
swapped for live gateway calls later by flipping one flag, with no change to the surfaces.

## 2. Scope

**In scope** — all three surfaces from the DS UI kits, as one Vite SPA:

- **Public web** (`web` kit): Landing, Search results, Listing detail.
- **Seeker app** (`app` kit): Dashboard, Messaging (navy fixed-sidebar layout).
- **Partner portal** (`partner` kit): institutional partner space (roster, verifications,
  quotas/reporting).

**Out of scope (flagged):**
- Real photography and logo — neutral placeholders per DS policy (`assets/logo.svg` /
  `assets/icons/` to be supplied later).
- **Live backend wiring** — the API seam is built and shaped like semsar's, but this build
  resolves to mock fixtures. Flipping to live gateway calls is a follow-up.
- Real authentication, escrow/payment, e-signature (the auth-token storage shape matches
  semsar so it plugs in later — see §3.4).
- **Backend tenant resolution** — the shared gateway/backend distinguishing M3a-L3chrane from
  SemsarOut by request `Host` (or an equivalent tenant key) is a **backend dependency**, not
  part of this frontend build. Noted as an assumption in §6.
- Full AR / darija-latin translation and RTL runtime toggle — layout stays RTL-friendly and
  copy is French-first; full i18n is v2.
- React Native mobile app (DS `apps/mobile`, v2).

## 3. Architecture

**One Vite + React 18 + Tailwind 3 SPA**, matching the existing semsar frontend's toolchain
(Vite 7, React 18, Tailwind 3, `react-router-dom` 6). Three surfaces are **route-based**, each
lazy-loaded so a surface's code is not shipped until visited.

Location: **`frontend-m3a-l3achrane/`** at repo root (sibling of `frontend/`). Own
`package.json` / `node_modules` — zero coupling to the semsar app.

```
frontend-m3a-l3achrane/
  index.html
  vite.config.js  tailwind.config.js  postcss.config.js  package.json
  .eslintrc.cjs   .gitignore
  src/
    main.jsx
    App.jsx                        # <BrowserRouter> + lazy route tree
    styles/
      tokens/  colors.css typography.css spacing.css effects.css fonts.css
      styles.css                   # single entry: @imports tokens + base/reset
    ds/                            # design system — self-contained, no upward imports
      index.js                     # barrel re-export
      core/    Button IconButton Icon Badge Chip Avatar Card Input Select Tabs
      trust/   VerifiedBadge MatchScore CompatibilityRing FeatureItem
      listing/ ListingCard PriceTag AmenityChip
      nav/     SidebarNav TopBar
    surfaces/
      web/     WebLayout Landing SearchResults ListingDetail
      app/     AppLayout Dashboard Messaging
      partner/ PartnerLayout PartnerPortal
    services/  api.js               # axios client, mirrors semsar (baseURL /api/v1 + interceptors)
    data/      listings.js profiles.js partners.js messages.js  index.js  # mock fixtures
    lib/       format.js            # MAD money, French spacing, match-% helpers
```

### 3.1 Design tokens — ported verbatim

The DS `tokens/*.css` (colors, typography, spacing, effects, fonts) are copied **unchanged**
into `src/styles/tokens/` and imported once via `src/styles/styles.css`. These define the CSS
custom properties the components rely on:

- **Navy** `--navy-700 #1b2a52` (trust anchor: headers, primary buttons, headings, partner CTA)
- **Gold** `--gold-500 #efb24d` (single accent: *S'inscrire*, hero highlight, step dots)
- **Green** `--green-500 #2bb673` (verified / good compatibility only)
- Near-white `--gray-50` backgrounds, white cards, hairline `--border-subtle #e3e7ef`
- Radii (`--radius-sm 8px` inputs/buttons, `16px` cards, pill chips/avatars), soft shadows,
  4px spacing scale.
- Fonts: **Plus Jakarta Sans** (Latin) + **Tajawal** (Arabic) via CDN `@import` in `fonts.css`
  (substitution, flagged — swap for self-hosted binaries later).

`tailwind.config.js` `theme.extend` maps these CSS variables (colors, radii, shadows, spacing,
font families) so Tailwind utilities and the token system stay in lockstep — utilities read
`var(--...)`, they never hard-code hex.

### 3.2 Design-system components — converted to ES modules

Each DS component ships as browser-global JSX under
`window.M3aL3chraneDesignSystem_7918b4` and pulls Lucide from CDN. Conversion rules:

- Rewrite each to a standard `export function Component(props) {…}` ES module, preserving the
  component's markup, class names, variants, and prop contract (the `.d.ts` and `.prompt.md`
  in the DS project define the contract to honor).
- `Icon` wrapper uses **`lucide-react`** (npm dependency) instead of the CDN `lucide` global.
- No behavioral change — this is a faithful port, not a redesign. `src/ds/index.js` re-exports
  all of them.
- `ds/` imports only from `ds/` and `lib/` — never from `surfaces/` or `data/`, so it stays
  extractable into a standalone package later.

### 3.3 Surfaces & routing

`react-router-dom` v6. Three layout shells matching the three UI kits, each a lazy chunk:

| Route | Surface | Layout | Screens |
|-------|---------|--------|---------|
| `/` | web | `WebLayout` (navy TopBar + footer, centered ~1200px) | `Landing` |
| `/recherche` | web | `WebLayout` | `SearchResults` (filter bar, sort, 3-col `ListingCard` grid) |
| `/annonce/:id` | web | `WebLayout` | `ListingDetail` (gallery, facts, amenities, roommates, sticky contact card) |
| `/espace` | app | `AppLayout` (fixed 248px navy `SidebarNav`) | `Dashboard` |
| `/espace/messages` | app | `AppLayout` | `Messaging` |
| `/partenaire` | partner | `PartnerLayout` | `PartnerPortal` |

Landing → *Rechercher* / card click navigates to search / detail; breadcrumb returns. A small
surface-switcher (or footer links) lets a reviewer jump between web / seeker / partner without
auth. `App.jsx` wraps routes in `<Suspense>` with a light fallback.

### 3.4 Data layer — mock behind a semsar-shaped seam

M3a-L3chrane shares SemsarOut's backend/gateway, so the client is built to match semsar's,
with mock fixtures behind a single switch:

- **`src/services/api.js`** — an axios instance identical in shape to semsar's:
  `baseURL: '/api/v1'`, JSON headers, a request interceptor attaching the Bearer token from
  `localStorage['auth-storage']` (same key/shape as semsar so a future shared session plugs in),
  and a 401→`/auth/refresh` response interceptor. Present but unused while mocks are on.
- **Per-domain service modules** (`listingsService`, `profilesService`, `partnersService`,
  `messagesService`) expose async functions (`listListings()`, `getListing(id)`, …). Each reads
  a **`USE_MOCK`** flag (env `VITE_USE_MOCK`, default `true`): when true it resolves the
  `src/data/` fixture; when false it calls `api.js`. Surfaces only ever call the service
  functions (always async), so flipping the flag needs **zero surface changes**.
- **`src/data/*.js`** — plain JS fixtures shaped like expected API responses:
  - `listings.js` — ~9–12 realistic Moroccan colocations: title, city/quartier, price (MAD/mois),
    photos (placeholder blocks), amenity chips, current-roommate avatars, match %, verified flag.
  - `profiles.js` — seeker profiles with compatibility fields (neutral-lifestyle terms only:
    *Non-fumeur, Calme, Invités OK* — **never** nationality/origin/religion labels, hard DS rule).
  - `partners.js` — institutional partners (universities/employers), rosters, verification
    counts, quotas.
  - `messages.js` — conversation threads for Messaging.
  - `index.js` barrel.
- **Dev proxy** — `vite.config.js` proxies `/api` and `/uploads` → `http://localhost:8099`
  (the same gateway semsar uses), on a distinct port (e.g. `5610`) so both frontends run
  side by side.

### 3.5 Content & copy rules (enforced)

Copy follows the DS content fundamentals exactly:
- French, « vous », sentence case, trust-first tone (« Profils vérifiés », « Paiement sécurisé »).
- Money: `2 300 MAD /mois` (space thousands, MAD suffix, /mois) via `lib/format.js`.
- Match quality: bare `85%` badge, green when strong. Verified: shield + « Vérifiée ».
- Emoji only in conversational surfaces (👋 greeting, 😊 in chat), never in structural UI.
- French spacing (insecable space before `: ; ! ?`, « … » quotes) in `lib/format.js` helpers.

## 4. Error handling & states

- Route not found → simple French 404 within `WebLayout`.
- `/annonce/:id` with unknown id → "Annonce introuvable" empty state, link back to search.
- Empty search results → calm empty state, not an error.
- Component states per DS: hover lift/darken, navy focus ring, disabled opacity ~0.5.
- No network layer means no loading/error network states in this build (documented seam for later).

## 5. Testing

Per the repo's testing-protocol:
- **Build gate:** `npm run build` succeeds; `npm run lint` clean (ESLint config mirrors semsar).
- **Route smoke:** each route (`/`, `/recherche`, `/annonce/1`, `/espace`, `/espace/messages`,
  `/partenaire`) renders without console errors (dev server / preview).
- **Visual check:** compare rendered surfaces against `uploads/layout.png` for the landing hero,
  listing card, seeker dashboard, and partner block.
- No unit-test suite in this mock-data build; a `format.js` smoke check is optional.

## 6. Integration with the monorepo & shared infra

- **Own domain, shared backend/infra.** M3a-L3chrane is served as its own static build under its
  own domain, but its `/api` (+`/uploads`) traffic targets the **same gateway** (`:8099`) as
  SemsarOut. In dev this is the Vite proxy (§3.4); in prod the domain's reverse proxy points
  `/api` at the shared gateway.
- **Backend tenant resolution (dependency, out of scope here).** For one gateway/backend to serve
  two domains, it must scope requests to the right vertical — expected via the request `Host`
  header (or an explicit tenant key). This spec assumes that mechanism exists or is added on the
  backend side; this frontend does nothing special beyond same-origin `/api` calls. Flagged so
  the backend work is tracked separately.
- Add a **root `Makefile`** target group (e.g. `m3a-dev`, `m3a-build`, `m3a-lint`) mirroring the
  existing frontend targets, so the new app joins the standard gate without disturbing semsar.
- `.gitignore` covers `frontend-m3a-l3achrane/node_modules` and `dist`.
- No changes to `services/`, `gateway/`, `backend/`, or the existing `frontend/` in this build.

## 7. Non-negotiables

- No secrets, no hard-coded credentials/tokens (there is no backend to authenticate to anyway).
- Placeholders for logo/photography; do not reconstruct the real logo from the mockup (DS policy).
- Faithful port of DS components — no unrequested redesign or refactor of the design language.
