# service payment

Encaissement en **séquestre CMI** (simulé, même esprit que le mock du monolithe). Cloisonné
par agence (JWT). Schéma + rôle PostgreSQL dédiés (ADR-0002). Émet les événements du cycle
séquestre via l'outbox.

## Cycle séquestre

```
POST /payment/payments              -> pending  (+ gateway_url simulée)
POST /payment/payments/{id}/pay     -> held     (fonds SOUS SÉQUESTRE)   émet payment.held
POST /payment/payments/{id}/release -> released (fonds au bénéficiaire)  émet payment.released
POST /payment/payments/{id}/refund  -> refunded                          émet payment.refunded
```

## Démarrer (dev)

```bash
psql "$ADMIN_DATABASE_URL" -f db/schema.sql
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e ../../libs/semsar_events -e .

uvicorn app.main:app --host 0.0.0.0 --port 8007   # JWT_PUBLIC_KEY requis
python -m app.relay                                # relais outbox -> RabbitMQ
```

`billing` consomme `payment.released` pour activer un abonnement (chorégraphie).
Le BFF route `/api/v1/payment/*` ici. En cible : intégration CMI réelle derrière `gateway.py`.
