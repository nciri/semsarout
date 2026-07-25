# Service `payment`

Intention de paiement + webhook passerelle, extrait du monolithe. **Réécrit pour servir les routes
legacy** que le front consomme (cf. `backend/app/api/v1/payments.py`). Passerelle CMI **simulée**
(comme le monolithe : `payment_url` mock).

- **Port** : 8507 · **Schéma/rôle Postgres** : `payment` (ADR-0002).
- **Routes** (reroutées par le BFF, préfixe `/api/v1` retiré) :
  `POST /payments/create-intent` (auth optionnelle), `POST /payments/webhook`,
  `GET /payments/{reference}`, `GET /my-payments`.
- **Montant** : services ponctuels via `SERVICE_PRICES` ; abonnement via projection locale `plan_ro`
  (prix par slug, amorcée à la migration).
- **Webhook confirmé** (paiement d'abonnement) → émet `payment.completed` (outbox → `app/relay.py`) ;
  le **worker billing** crée/prolonge l'abonnement (v2-native, pas d'écriture cross-domaine). Le
  monolithe écrivait directement la `Subscription` — ici c'est chorégraphié par événement.
- **Auth optionnelle** : `create-intent`/`{ref}` lisent l'identité des en-têtes `x-semsar-*` posés
  par le BFF (absent = paiement anonyme, comme `@jwt_required(optional=True)`).

## Migration & lancement

```bash
psql "$ADMIN" -f services/payment/db/schema.sql                  # rôle + schéma (une fois)
# init_db() crée les tables au démarrage du service, puis :
psql "$ADMIN" -f services/payment/db/migrate_from_monolith.sql   # plan_ro (+ paiements existants)
```

Lancé par `scripts/dev-mesh-up.sh` (service + relais ; `PAYMENT_URL` câblé au BFF). Pas de worker
(payment est publisher). Vérification de parité : `tools/contract_test.py --services payment`.
