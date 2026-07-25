# Service `contract`

Modèles + contrats + fusion + finalisation PDF, extrait du monolithe. **Réécrit pour servir les
routes legacy** que le front consomme (cf. `backend/app/api/v1/backoffice/contracts.py`).

- **Port** : 8505 · **Schéma/rôle Postgres** : `contract` (ADR-0002).
- **Routes** (reroutées par le BFF, préfixe `/api/v1` retiré) :
  `/backoffice/contract-templates*`, `/backoffice/contracts*` (+ `/{id}/finalize`, `/{id}/mark-signed`,
  `/{id}/pdf`).
- **Gate premium** (`Principal.features`) : `contracts` (accès, 403 "Fonction réservée aux plans Pro
  et Entreprise.") et **`contract_templates`** (gestion des modèles, plan Entreprise →
  `can_manage_templates`). Cet entitlement est projeté dans `identity.agency_ro.features`
  (voir `services/identity/db/migrate_from_monolith.sql`) car les flags de plan seuls ne distinguent
  pas Pro d'Entreprise.
- **Fusion** (`app/merge.py` + `app/sanitize.py`) : `{{placeholders}}` remplis depuis les projections
  locales `agency_ro`/`property_ro`/`client_ro`/`transaction_ro` (maintenues par `listing.*` /
  `transaction.*`, cf. `app/worker.py`) + nom d'agent via l'endpoint interne du monolithe.
- **Finalisation** : rendu PDF (`xhtml2pdf`, `app/pdf.py`) → **stockage objet** (MinIO/S3,
  `app/storage.py`) ; l'endpoint `/pdf` relit et diffuse. La copie du PDF dans les documents de la
  transaction liée est **déléguée** : `contract.finalized`/`contract.signed` (outbox → `app/relay.py`)
  → le service transactions crée/maj le `TransactionDocument`.

## Migration & lancement

```bash
psql "$ADMIN" -f services/contract/db/schema.sql                 # rôle + schéma (une fois)
# init_db() crée les tables au démarrage du service, puis :
psql "$ADMIN" -f services/contract/db/migrate_from_monolith.sql
```

Lancé par `scripts/dev-mesh-up.sh` (service + relais + worker ; `CONTRACT_URL` + env S3 câblés).
Dépendances runtime : `bleach`, `xhtml2pdf` (à installer côté runtime des services).
Vérification de parité : `tools/contract_test.py --services contract`.
