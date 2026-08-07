# Web UI kit — public marketplace (`apps/web`)

Interactive recreation of the public site, matching `uploads/layout.png`.

- **Landing** — navy TopBar, split hero (headline with gold *confiance* highlight, role toggle,
  search box with Colocations/Résidences tabs), three mini trust props, trust band, 5-step
  "how it works", partner logo row, navy partner-CTA block, footer.
- **Search results** — filter bar, sort, filter chips, 3-col grid of `ListingCard`s.
- **Listing detail** — gallery, title + price + verified badge, facts, amenities, description,
  current-roommate avatars, sticky contact + escrow reassurance card.

Click *Rechercher* / a card to move between views; breadcrumb returns.

Files: `index.html` (mounts), `App.jsx` (all screens). Composes DS components from
`window.M3aL3chraneDesignSystem_7918b4`. Image areas are neutral placeholders — supply real photography.
