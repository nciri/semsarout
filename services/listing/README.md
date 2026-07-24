# service listing — Stage 1 (CRUD/cycle de vie des biens)

**Source de vérité des biens.** Reproduit à l'identique :

- `GET /properties/{id}` — détail **public**, **incrémente les vues**, **masque les annonces
  des comptes modérés** (spec §6, via la liste interne du monolithe, en cache).
- `POST/PUT/DELETE /properties`, `POST /properties/{id}/publish` — propriétaire (`owner_id`).
- `GET /my-properties` — mes annonces (filtres statut / type, pagination).

Émet `listing.created/updated/deleted` (consommés par **search** et **analytics**).

## ⚠️ Périmètre du Stage 1 (à ne pas confondre)

Restent au **monolithe** pour l'instant (→ Stage 2 `search`) : `GET /properties` (les **77 filtres**),
`POST /properties/search`, `GET /properties/suggestions`. Restent aussi : `contact`,
`reveal-phone` (→ CRM, Stage 3) et `price-position` (→ geo). Le **reroute BFF est ciblé**
sur les seules routes ci-dessus (méthode + motif de chemin), le reste part au monolithe.

## Extraction (reroute) — dark launch

```bash
psql -f db/schema.sql && psql -f db/migrate_from_monolith.sql
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e ../../libs/semsar_events -e .
uvicorn app.main:app --host 0.0.0.0 --port 8012
python -m app.relay
```

Le monolithe doit exposer `/api/v1/internal/moderation/hidden` (ajouté, avec `SEMSAR_INTERNAL_TOKEN`).
Dans le BFF : `LISTING_URL=http://localhost:8012`. **Reroute off par défaut** ; vérifier les tests
de contrat avant activation.
