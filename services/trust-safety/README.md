# service trust-safety

Modération des comptes (suspension), **audit** super-admin et **masquage** (§6).

- **API** (`app.main`) :
  - `POST /admin/accounts/{users|agencies}/{id}/{suspend|unsuspend}` (super-admin) — la
    mutation du compte est **déléguée** au monolithe (domaine identité en transition) pour une
    parité exacte ; trust-safety enregistre l'audit, met à jour son statut de modération et émet
    `account.suspended/unsuspended`.
  - `GET /moderation/hidden` et `GET /internal/moderation/hidden` — comptes masqués (source du
    masquage). Drop-in du endpoint interne du monolithe : les services (listing/search/geo/crm)
    peuvent repointer leur masquage ici.
- **Relay** (`app.relay`) : publie les événements `account.*`.
- **Source de vérité** : `moderation_status` (statut) + `admin_action` (audit).

## Démarrer (dev)
```bash
psql "$ADMIN" -f db/schema.sql
uvicorn app.main:app --port 8511
python -m app.relay
psql "$ADMIN" -f db/migrate_from_monolith.sql
```
