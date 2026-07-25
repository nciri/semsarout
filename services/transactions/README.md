# Service `transactions`

Pipeline ventes/locations extrait du monolithe : **transactions, offres, documents**.
Reproduit à l'identique `/backoffice/transactions*` (cf. `backend/app/api/v1/backoffice/transactions.py`).

- **Port** : 8514 · **Schéma/rôle Postgres** : `transactions` (ADR-0002).
- **Routes** (reroutées par le BFF, préfixe `/api/v1` retiré) : liste + filtres, `/pipeline` (Kanban),
  `/stats`, `/stages`, détail, CRUD, `/move`, `/offers` (GET/POST/PUT), `/documents` (GET/POST).
- **Projections locales** : `property_ro` (titre/ville, maintenue par `listing.*` — voir `app/worker.py`),
  `client_ro` (nom, amorcée à la migration). Noms d'agents via l'endpoint interne du monolithe
  (`app/users_client.py`).
- **Événements** : émet `transaction.created|updated|deleted` (outbox → `app/relay.py`) ; consommé par
  crm pour maintenir `transaction_ro` (compteur `transactions_count` par client).

## Migration & lancement

```bash
psql "$ADMIN" -f services/transactions/db/schema.sql              # rôle + schéma (une fois)
# init_db() crée les tables au démarrage du service, puis :
psql "$ADMIN" -f services/transactions/db/migrate_from_monolith.sql
```

Lancé par `scripts/dev-mesh-up.sh` (service + relais + worker + `TRANSACTIONS_URL` au BFF).
Vérification de parité : `tools/contract_test.py --services transactions`.

## Écarts assumés (hors contrat de lecture)

- `ActivityLog` (audit create/stage_change) non répliqué — comme crm.
- Bascule `property.status = sold/rented` sur `won` (effet cross-domaine listing) différée.
- Détail : `property`/`client` imbriqués = projections réduites (non consommés par le front).
