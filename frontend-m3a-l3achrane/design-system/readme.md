# M3a-L3chrane — Design System

**M3a-L3chrane** (معَ العشران — « avec les colocataires ») is a **verified roommate / co-living
marketplace for Morocco**, serving students and young professionals. Its structural difference
from a classified-ads portal is **institutional partnerships** (universities, schools, employers)
as the primary acquisition channel, plus three promises the informal market lacks: **trust**
(CIN + status verification), **compatibility** (a lifestyle-matching engine), and **a legal frame**
(e-signed roommate contract + escrowed deposit).

Products this system dresses:
- `apps/web` — public site (landing, search, listings, profiles, application flow, user space). Next.js, SEO-critical.
- `apps/admin` — back-office (moderation, support, referentials, disputes). React/Vite SPA.
- `apps/partner` — institutional partner portal (rosters, verifications, quotas, reporting, billing).
- `apps/mobile` — React Native (v2, not yet built).

Interfaces are **FR / AR / darija-latin, full RTL**; EN in v2.

## Sources given
- `uploads/layout.png` — a single high-fidelity composite mockup (landing hero, seeker dashboard,
  listing detail, mobile search/compatibility/messaging screens, web messaging, trust band, partner
  logos, "how it works", partner CTA). **This is the visual ground truth** for the whole system.
- The product brief (context, personas, functional scope, architecture, data model, matching engine,
  business model, stack, legal/CNDP constraints). Prose only — no codebase or Figma was attached.

There was **no codebase, Figma file, logo file, or font binary** provided. Where a real asset would
normally be copied in, this system substitutes and flags it (see Iconography and Fonts below).

---

## CONTENT FUNDAMENTALS

- **Language & address.** Primary UI language is **French**, warm and direct, addressing the user as
  **« vous »** (formal-but-friendly): *« Trouvez votre colocation idéale »*, *« Voici un aperçu de
  votre recherche »*, *« Bonjour Yassine »*. Arabic / darija-latin run in parallel (RTL). Never English in v1 UI.
- **Tone.** Reassuring, plain, trust-first. Copy repeatedly names the thing that removes risk:
  *« en toute confiance »*, *« Profils vérifiés »*, *« Paiement sécurisé »*, *« Un cadre clair pour tous »*.
  No hype, no growth-hacky exclamation. It sounds like an institution you can trust, not a startup shouting.
- **Casing.** Sentence case everywhere — headings, buttons, labels (*« Se connecter »*, *« Voir le détail »*,
  *« Rechercher »*). No ALL-CAPS except tiny eyebrow labels. French spacing/quotes conventions apply
  (« … », insecable space before : ; ! ?).
- **Microcopy pattern.** Feature = short bold title + one calm explanatory line:
  *« Profils vérifiés » / « CIN, statut étudiant ou employeur »*. Steps are numbered imperatives:
  *« 1. Créez votre profil », « 2. Recherchez & filtrez »*.
- **Numbers & badges.** Money is *« 2 300 MAD /mois »* (space thousands, MAD suffix, /mois). Match
  quality is a bare percentage badge (*85%*) tinted green when strong. Status is a single verified word
  with a shield: *« Vérifiée »*.
- **Emoji.** Sparingly and only human/warm ones in conversational surfaces — a waving hand after
  *« Bonjour Yassine 👋 »*, an occasional 😊 inside chat bubbles. **Never** in structural UI, buttons,
  or marketing headings.
- **Neutral by design.** Lifestyle is described in factual, non-identity terms (*« Non-fumeur », « Calme »,
  « Invités OK », « Pratique religieuse : modérée »*). No nationality, origin, or religion labels — a hard
  product rule, not a copy choice.

---

## VISUAL FOUNDATIONS

- **Palette.** A **deep navy** (`--navy-700` #1b2a52) is the trust anchor — headers, primary buttons,
  headings, the partner CTA block. A single **warm gold** (`--gold-500` #efb24d) is the only accent:
  the *S'inscrire* button, the highlighted word in the hero (*confiance*), the roof of the logo mark,
  step-number dots. **Green** (`--green-500` #2bb673) means one thing only: **verified / good
  compatibility** (badges, the 85% ring). Backgrounds are near-white (`--gray-50`) with white cards.
  Discipline: at most navy + one neutral field per screen; gold and green are punctuation, never fields.
- **Type.** Geometric-humanist sans throughout (Plus Jakarta Sans as substitute). Headings are heavy
  (700–800), tight tracking, navy. Body is 15px, 400–500, `--gray-700`. Eyebrows are 11px bold. Arabic
  uses Tajawal. Generally a single family across the product with weight/size carrying hierarchy.
- **Spacing & layout.** 4px base scale. Generous card padding (20–24px). Public site is centered,
  max ~1200px. App is a fixed navy left sidebar (248px) + light content canvas. Sections breathe
  (64–96px vertical rhythm on marketing).
- **Cards.** White, `--radius-lg` (16px), hairline `--border-subtle`, soft low shadow (`--shadow-sm`
  → `--shadow-md` on hover). Listing cards: full-bleed photo on top with a floating match-% badge,
  then title / location / price / a row of feature chips. No colored left-border accents anywhere.
- **Corner radii.** Chips & avatars = pill/round. Buttons & inputs = `--radius-sm` (8px). Cards =
  16px. Large surfaces (hero art, partner block) = `--radius-lg`/`xl`.
- **Backgrounds & imagery.** Photography is real, warm, and human — Moroccan cityscapes (Hassan II
  mosque in the hero) and bright, tidy interiors. No gradients as decoration except a subtle
  navy→transparent protection scrim over hero photos. No hand-drawn illustration for core UI; the
  partner block uses a simple flat dashboard vignette. Placeholders in this system use neutral tinted
  blocks (real photography must be supplied).
- **Elevation & depth.** Soft shadows, never harsh. The navy header/sidebar carry a deeper
  `--shadow-nav`. Transparency/blur is minimal — reserved for image scrims and sticky headers.
- **Borders.** Hairline `--border-subtle` (#e3e7ef) for card and input outlines; `--border-default`
  on hover/focus fields; navy focus ring (`--ring-focus`).
- **Motion.** Restrained and quick — 120–280ms, `--ease-standard`. Hover = slight lift + shadow
  deepen on cards; buttons darken (navy→navy-800, gold→gold-600). Press = subtle scale-down (0.98).
  No bounce, no parallax. Compatibility ring animates its sweep once on load.
- **States.** Hover darkens fills / raises cards; focus shows the navy ring; disabled drops opacity to
  ~0.5 and removes shadow. Links are navy, darken on hover, never browser-blue.

---

## ICONOGRAPHY

- **No icon font or SVG set was provided.** The mockup uses a consistent **thin-to-medium line icon**
  style (home, heart, message-circle, user, bell, settings, shield-check, map-pin, calendar, wifi,
  bed, users, sliders). This is closest to **Lucide**, which this system **links from CDN**
  (`https://unpkg.com/lucide@latest`) and uses via the `<Icon>` wrapper component. **Substitution
  flagged** — if the brand ships its own icon set, drop it into `assets/icons/` and repoint `Icon`.
- **Verification** is always shield + check, tinted `--verified` green.
- **Emoji** appear only in conversational/greeting contexts (👋 in the dashboard greeting; occasional
  😊 in chat), never as UI iconography.
- **Logo.** No logo file was supplied. The mockup shows a house-glyph + « M3a-L3chrane / مع العشران »
  wordmark, but per policy this system does **not** reconstruct the real mark from the screenshot.
  Wherever a logo belongs, the `Logo` component renders the **wordmark in type** (with the Arabic line).
  Please supply `assets/logo.svg` to replace it.

---

## INDEX / manifest

Root:
- `styles.css` — the one entry point consumers link (`@import`s the token files below).
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`.
- `thumbnail.html` — homepage tile.
- `SKILL.md` — Agent-Skills-compatible entry.
- `readme.md` — this file.

Foundations cards live beside the tokens (`tokens/cards/`), grouped **Type / Colors / Spacing / Brand**.

Components (`components/`, namespace `window.M3aL3chraneDesignSystem_7918b4`):
- `core/` — Button, IconButton, Icon, Badge, Chip, Avatar, Card, Input, Select, Tabs
- `trust/` — VerifiedBadge, MatchScore, CompatibilityRing, FeatureItem
- `listing/` — ListingCard, PriceTag, AmenityChip
- `nav/` — SidebarNav, TopBar

UI kits (`ui_kits/`):
- `web/` — public marketplace (landing, search results, listing detail)
- `app/` — seeker dashboard + messaging
- `partner/` — institutional partner portal

## Intentional additions
- **Icon** — a Lucide wrapper, needed because the source relies on a line-icon set but shipped none.

## CAVEATS
- Fonts and the icon set are **substitutions** (Plus Jakarta Sans / Tajawal / Lucide) — flagged above.
- No real photography/logo — placeholders stand in.
