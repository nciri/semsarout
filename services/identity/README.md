# service identity

Premier service extrait — valide le flux **BFF → service → outbox → RabbitMQ**.
Domaine : auth (JWT RS256), RBAC, équipes/sièges, **vérification CIN (KYC)**.

Schéma + rôle PostgreSQL dédiés (**natif**, ADR-0002) : `search_path = identity`.

## Démarrer (dev)

```bash
# 1) Rôle + schéma (une fois), via un rôle admin sur la base SemsarOut
psql "$ADMIN_DATABASE_URL" -f db/schema.sql

# 2) Config + dépendances
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e ../../libs/semsar_events -e .

# 3) API sur :8001
uvicorn app.main:app --host 0.0.0.0 --port 8001

# 4) Relais outbox → RabbitMQ (process séparé)
python -m app.relay
```

## Valider le flux bout-en-bout

```bash
# via le BFF (IDENTITY_URL doit pointer :8001 dans gateway/.env)
curl -X POST localhost:8080/api/v1/identity/kyc -H 'content-type: application/json' \
     -d '{"user_id": 1, "cin": "AB123456"}'
# → 201 {"id":1,"status":"pending"}
# Le relais publie « identity.kyc.requested » sur l'exchange semsar.events
# (visible dans RabbitMQ UI :15672). Tout consumer lié (ex. notification) le reçoit.
```

## Tests

```bash
pip install -e .[test]
pytest tests
```
