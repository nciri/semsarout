# service crm — Stage A (leads)

Cœur du back-office CRM. **Stage A = leads** (débloque le Stage 3 de `listing` : contact/reveal
→ création de lead). Reproduit à l'identique `/backoffice/leads*` (list+filtres, détail+lu,
create/update/delete, assign/contact/qualify, stats, agents). Erreurs legacy `{'error'}`.

**Couplages gérés :**
- `property_title` → **projection locale `property_ro`** alimentée par `listing.*` (worker).
- `assigned_to_name` / agents → endpoint **interne du monolithe** (`/internal/agency/users`), en cache.

**Écarts assumés :** `ActivityLog` (audit) non répliqué (→ trust-safety). Les sous-domaines
**clients · visites · transactions** suivront (mêmes patrons, mêmes projections).

## Extraction (reroute) — dark launch

```bash
psql -f db/schema.sql && psql -f db/migrate_from_monolith.sql
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e ../../libs/semsar_events -e .
uvicorn app.main:app --host 0.0.0.0 --port 8013
python -m app.worker   # projection listing.* -> titres des biens
```

Dans le BFF : `CRM_URL=http://localhost:8013` (reroute `/backoffice/leads*`). **Off par défaut** ;
vérifier les tests de contrat avant activation.
