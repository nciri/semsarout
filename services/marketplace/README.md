# service marketplace

**Panier + commandes** (agence). Reproduit à l'identique les routes du monolithe :
`/backoffice/shop/cart*`, `/backoffice/shop/orders*`, `/admin/orders*`. Erreurs legacy
`{'error': msg}`. Ne **possède pas** les produits.

## Couplage au catalogue (option 2, ADR-0004)

- **Projection locale `product_ro`** alimentée par les événements `product.*` de `catalog`
  → affichage panier + snapshots au checkout, sans appel synchrone par requête.
- **Réservation de stock au paiement** : appel interne autoritaire `catalog /internal/products/reserve`
  (tout ou rien) → la source de vérité du stock reste `catalog`.
- **`product.deleted`** : le worker vide les paniers concernés et détache les `order_item`
  (snapshots nom/prix conservés) — fidèle au comportement du monolithe.

## ⚠️ Écart de fidélité assumé

La **dérivation de l'adresse de livraison depuis un bien** (`property_id`) relève du domaine
**`listing`** (non encore extrait). Ici, `property_id` est stocké mais l'adresse vient du corps
de la requête. Fidélité complète = après extraction de `listing`. À valider par tests de contrat.

## Extraction (reroute) — dark launch

```bash
psql -f db/schema.sql && psql -f db/migrate_from_monolith.sql
cp .env.example .env   # TRUST_GATEWAY_HEADERS=true, CATALOG_INTERNAL_URL, INTERNAL_TOKEN
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e ../../libs/semsar_events -e .
uvicorn app.main:app --host 0.0.0.0 --port 8010    # API
python -m app.worker                                # projection product.*
```

Dans le BFF : `MARKETPLACE_URL=http://localhost:8010` (+ `CATALOG_URL`). **Reroute désactivé
par défaut** ; vérifier les tests de contrat avant d'activer, puis décommissionner le shop du monolithe.
