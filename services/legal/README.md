# Service `legal`

Notaires + dossiers juridiques + checklists, extrait du monolithe. **Réécrit pour servir les
routes legacy** que le front consomme (cf. `backend/app/api/v1/backoffice/legal.py`).

- **Port** : 8506 · **Schéma/rôle Postgres** : `legal` (ADR-0002).
- **Routes** (reroutées par le BFF, préfixe `/api/v1` retiré) :
  `/backoffice/notaries*`, `/backoffice/legal-cases*` (+ `/{id}/tasks`), `/backoffice/legal-tasks/{id}`.
- **Gate premium** : `Principal.features` (le BFF projette `plan.has_legal` → feature `legal`) ;
  sans le feature → 403 `{'error': "Fonction réservée aux plans Pro et Entreprise."}` (parité monolithe).
- **Projections locales** (appartenance agence à la création d'un dossier lié) :
  `transaction_ro` (id, agence, type, référence — via `transaction.*`) et `property_ro` (id, agence —
  via `listing.*`), maintenues par `app/worker.py`. Amorcées à la migration.
- Pas de relais (le service n'émet aucun événement). Pas de résolution de noms (les to_dict legacy
  n'exposent que des id).

## Migration & lancement

```bash
psql "$ADMIN" -f services/legal/db/schema.sql                 # rôle + schéma (une fois)
# init_db() crée les tables au démarrage du service, puis :
psql "$ADMIN" -f services/legal/db/migrate_from_monolith.sql
```

Lancé par `scripts/dev-mesh-up.sh` (service + worker ; `LEGAL_URL` déjà câblé au BFF).
Vérification de parité : `tools/contract_test.py --services legal --legal-case-id <id>`.
