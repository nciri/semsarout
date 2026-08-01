# service catalog

**Source de vérité des produits** (plateforme). Reproduit à l'identique les routes du
monolithe consommées par le front :

- Agence (lecture) : `GET /backoffice/shop/categories`, `/products`, `/products/{id}` (actifs).
- Super-admin (CRUD) : `GET/POST/PUT/DELETE /admin/products`.

Émet `product.created/updated/deleted` → consommés par **search** (index) et **marketplace**
(nettoyage panier/commandes sur suppression). Erreurs au format legacy `{'error': msg}`.

## Extraction (reroute) — dark launch

1. `psql -f db/schema.sql` puis **migration** : `psql -f db/migrate_from_monolith.sql`.
2. Config + deps + run :
   ```bash
   cp .env.example .env   # TRUST_GATEWAY_HEADERS=true (identité injectée par le BFF)
   pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e ../../libs/semsar_events -e .
   uvicorn app.main:app --host 0.0.0.0 --port 8009
   python -m app.relay
   ```
3. Dans le BFF : `CATALOG_URL=http://localhost:8009` → le BFF reroute les routes produits
   vers ce service. **Vérifier les tests de contrat** avant d'activer en prod.
4. Décommission : retirer les routes produits du monolithe une fois la parité confirmée.

> Le reroute est **désactivé par défaut** (CATALOG_URL vide → tout part au monolithe).
