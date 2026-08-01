# service geo

Positionnement prix + **référentiel prix/m² par quartier**. Reroute des routes existantes
du monolithe (parité de contrat, erreurs legacy `{'error': msg}`).

- **API** (`app.main`) :
  - `GET /properties/{id}/price-position` (public) — où se situe le prix/m² du bien dans son quartier.
  - `GET/POST/PUT/DELETE /market/neighborhood-prices` (super-admin) — références manuelles.
- **Worker** (`app.worker`) : consomme `listing.#` → maintient `listing_ro` (projection des biens
  pour le calcul auto). Pas d'appel synchrone au listing.
- **Source de vérité** : `neighborhood_price_ref` (références manuelles). `listing_ro` est
  reconstructible en rejouant les événements.

## Démarrer (dev)

```bash
psql "$ADMIN" -f db/schema.sql
uvicorn app.main:app --port 8509        # API
python -m app.worker                    # projection listing_ro (process séparé)
psql "$ADMIN" -f db/migrate_from_monolith.sql   # amorçage
```

## Calcul (porté à l'identique du monolithe)

Référence, par priorité : (1) `NeighborhoodPriceRef` manuelle du quartier ; (2) auto =
médiane des prix/m² des biens **actifs** (quartier·type → quartier → ville·type → ville),
avec un minimum de 3 comparables. Bandes : `very_low … very_high` selon l'écart au marché.
