# Service `billing`

Plans + abonnements + facturation, extrait du monolithe. **Réécrit pour servir les routes legacy**
que le front consomme (cf. `backend/app/api/v1/subscriptions.py` + `billing.py`).

- **Port** : 8508 · **Schéma/rôle Postgres** : `billing` (ADR-0002).
- **Routes** (reroutées par le BFF, préfixe `/api/v1` retiré) :
  `GET /subscription-plans` (+ `/{id}`), `GET /my-subscription`, `GET /subscription/current`,
  `POST /cancel-subscription`, `POST /subscription/change-plan`.
- **`change-plan`** : le monolithe **500ait** (tables `payment_methods`/`invoices` absentes en base) ;
  v2 le rend fonctionnel — validation du plan (404, par id **ou** slug), garde-fou de rétrogradation
  (409, sièges/équipes vs limites du nouveau plan), puis bascule *incomplete* + facture *unpaid* +
  `billing.invoice.created` (chorégraphie paiement v2 : service payment → worker billing active).
- **Garde-fou sièges** : lu via l'endpoint interne d'**identity** (`GET /internal/agency/{id}/seats`,
  jeton interne) — identity est propriétaire des membres/équipes (v2-native, pas le monolithe).
  Voir `app/seats_client.py` + `IDENTITY_URL`.

## Migration & lancement

```bash
psql "$ADMIN" -f services/billing/db/schema.sql                  # rôle + schéma (une fois)
# init_db() crée les tables au démarrage du service, puis :
psql "$ADMIN" -f services/billing/db/migrate_from_monolith.sql   # plans + abonnements
```

Lancé par `scripts/dev-mesh-up.sh` (service + relais + worker ; `BILLING_URL` + `IDENTITY_URL` câblés).
Vérification de parité : `tools/contract_test.py --services billing`.

## Écart assumé

Les features de gating restent projetées par identity (`agency_ro.features`) ; billing ne les pilote
pas encore (bascule au décommissionnement final, #6).
