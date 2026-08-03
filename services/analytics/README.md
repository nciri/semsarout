# service analytics

Projection **d'agrégats** k-anonymisés — 2ᵉ projection Phase 1. Consomme `listing.#` et
`identity.#`, maintient des **compteurs d'événements** (monotones), **idempotents** (dédup
par `message_id` — indispensable pour des compteurs). Schéma + rôle PostgreSQL dédiés
(**natif**, ADR-0002). Reconstructible en rejouant les événements.

- **Worker** (`app.worker`) : consomme les événements → incrémente `metric_counter`.
- **API** (`app.main`) : `GET /analytics/overview` — **réservé aux rôles admin/analyst**
  (super-admin inclus), renvoie les compteurs + un résumé (`listings_net`, `kyc_*`).

## Démarrer (dev)

```bash
psql "$ADMIN_DATABASE_URL" -f db/schema.sql
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e ../../libs/semsar_events -e .

uvicorn app.main:app --host 0.0.0.0 --port 8004   # API (JWT_PUBLIC_KEY requis pour l'auth)
python -m app.worker                               # projection (process séparé)
```

## Différence clé avec `search`

`search` est **idempotent par nature** (upsert par id) → pas de table d'idempotence.
`analytics` **incrémente** → un rejeu doublerait les compteurs, d'où `processed_message`.
