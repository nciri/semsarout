# service directory

Artisans (**partagés** plateforme + **privés** agence) + **bons de travaux**. Reproduit à
l'identique les routes du monolithe (`/backoffice/artisans*`, `/backoffice/work-orders*`,
`/backoffice/artisan-trades`, `/admin/shared-artisans*`). Erreurs legacy `{'error': msg}`.

- **Gate d'abonnement** : routes back-office protégées par `require_feature('artisans')` —
  les entitlements du plan sont injectés par le BFF (`X-Semsar-Features`). Sans le plan → 403.
- **Isolation** : annuaire = partagés (`agency_id NULL`) + propres ; PUT/DELETE sur ses privés
  uniquement ; catalogue partagé géré par le super-admin (`/admin/shared-artisans`).

## ⚠️ Écart de fidélité assumé

La validation d'appartenance d'un **bien** (`property_id` d'un bon de travaux) relève de
`listing` (non extrait) — ici `property_id` est stocké tel quel. Fidélité complète après
extraction de `listing`.

## Extraction (reroute) — dark launch

```bash
psql -f db/schema.sql && psql -f db/migrate_from_monolith.sql
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e .
uvicorn app.main:app --host 0.0.0.0 --port 8011
```

Dans le BFF : `DIRECTORY_URL=http://localhost:8011`. **Reroute désactivé par défaut** ;
vérifier les tests de contrat avant activation, puis décommissionner le monolithe.
