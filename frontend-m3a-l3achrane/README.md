# M3a-L3chrane — front-end

Standalone Vite + React front-end for M3a-L3chrane, a colocation/rental marketplace.
It ships three surfaces from one app: the public **web** site (landing, recherche,
détail d'annonce), the authenticated seeker **espace** (tableau de bord,
messagerie), and the **partenaire** portal. All copy is French, prices are in MAD.

The design system (tokens + components) is ported from the project's Claude
Design workspace — see [DS provenance](#ds-provenance-et-substitutions) below.

## Getting started

```bash
npm install
npm run dev
```

The dev server runs on **port 5610** (`vite.config.js`). `/api` and `/uploads`
requests are proxied to the shared backend gateway at `http://localhost:8099`
(see `server.proxy` in `vite.config.js`), so the API layer (`src/services/api.js`,
an axios client with bearer-token injection) works unmodified against the real
gateway once it's running.

## Data mode: `VITE_USE_MOCK`

`src/services/index.js` exposes one async function per data need
(`listListings`, `getListing`, `getCurrentProfile`, `listPartners`, …). Every
function returns a `Promise` — even in mock mode — so surface components
always consume data through `useEffect`/`useState`, and switching from mock
to live data is a no-op at the call site.

- `VITE_USE_MOCK` unset or `"true"` (default): functions resolve from the
  static fixtures in `src/data/*` after a short artificial delay.
- `VITE_USE_MOCK=false`: functions call the real API through `src/services/api.js`
  (and therefore the `/api` proxy above).

Set it in a local `.env` (not committed):

```
VITE_USE_MOCK=false
```

## Routes

The router (`src/App.jsx`) lazy-loads every screen (`React.lazy` + `Suspense`,
fallback "Chargement…"), so each surface builds as its own JS chunk.

| Path | Layout | Screen | Surface |
| --- | --- | --- | --- |
| `/` | `WebLayout` | `Landing` | web |
| `/recherche` | `WebLayout` | `SearchResults` | web |
| `/annonce/:id` | `WebLayout` | `ListingDetail` | web |
| `/espace` (index) | `AppLayout` | `Dashboard` | app |
| `/espace/messages` | `AppLayout` | `Messaging` | app |
| `/partenaire` (index) | `PartnerLayout` | `PartnerPortal` | partner |
| `*` | — | `NotFound` | — |

Since there's no real auth in this build, a small dev-only pill bar
(`src/surfaces/SurfaceSwitcher.jsx`, fixed bottom-right) lets you jump between
`/`, `/recherche`, `/espace` and `/partenaire` while testing.

## DS provenance et substitutions

Tokens (`src/styles/tokens/*.css`) and components (`src/ds/**`) are ported
verbatim from the project's Claude Design workspace (component/token source
fetched via `DesignSync`), with import paths adjusted for this app's layout.
The single intentional behavioral change is `src/ds/core/Icon.jsx`: the
original used a CDN-hosted Lucide build, replaced here with the npm
`lucide-react` package (no CDN dependency).

Flagged substitutions versus the original design (`uploads/layout.png`):

- **Fonts** — system font stack in `src/styles/tokens/fonts.css` in place of
  any licensed/CDN webfont.
- **Icons** — `lucide-react` (bundled) instead of a CDN icon script.
- **Photos** — neutral lifestyle placeholder imagery only; no real listing
  photography.
- **Logo** — a text/wordmark placeholder; no proprietary brand mark.

## Scripts

```bash
npm run dev      # vite dev server, port 5610
npm run build    # production build to dist/
npm run preview  # preview the production build
npm test         # node --test (src/lib/format.test.mjs)
npm run lint     # eslint src --ext js,jsx --max-warnings 0
```
