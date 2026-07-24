# service billing

Plans · abonnements · factures. **Cloisonné par agence** (JWT). Schéma + rôle PostgreSQL
dédiés (ADR-0002). Illustre une **chorégraphie inter-services** avec `payment`.

- `GET /billing/plans` — plans (semés : starter/pro/enterprise).
- `GET /billing/subscription` — abonnement courant de l'agence.
- `POST /billing/subscribe {plan_slug}` — crée abonnement *pending* + facture *unpaid*,
  émet `billing.invoice.created`, renvoie `invoice_id` + `amount`.
- **Worker** (`app.worker`) : consomme `payment.released` (purpose=subscription) →
  facture *paid* + abonnement *active* → émet `billing.subscription.activated`. Idempotent.

## Chorégraphie (saga par événements)

```
billing.subscribe ─► facture unpaid ─(client)─► payment.create+pay+release
                                                        │ payment.released
                                                        ▼
                                    billing.worker ─► abonnement ACTIVE
```

## Démarrer (dev)

```bash
psql "$ADMIN_DATABASE_URL" -f db/schema.sql
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e ../../libs/semsar_events -e .

uvicorn app.main:app --host 0.0.0.0 --port 8008   # JWT_PUBLIC_KEY requis
python -m app.worker                               # chorégraphie (consumer)
python -m app.relay                                # relais outbox -> RabbitMQ
```
