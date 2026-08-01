# service notification

Premier **consumer** réel — ferme la boucle événementielle. S'abonne à `identity.kyc.#`
sur l'exchange `semsar.events`, réagit de façon **idempotente**, avec **file + DLQ** dédiées.
Schéma + rôle PostgreSQL dédiés (**natif**, ADR-0002).

- **API** (`app.main`) : `/health`, `/metrics` (supervision uniquement).
- **Worker** (`app.worker`) : consomme les événements et écrit dans `notification_log`.

## Démarrer (dev)

```bash
psql "$ADMIN_DATABASE_URL" -f db/schema.sql
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_events -e .

uvicorn app.main:app --host 0.0.0.0 --port 8002   # supervision
python -m app.worker                               # consumer (process séparé)
```

## Valider la boucle bout-en-bout

1. Lancer identity (+ son relais) et notification (worker).
2. `POST /api/v1/identity/kyc` (via le BFF) → identity publie `identity.kyc.requested`.
3. Le worker notification **reçoit** l'événement et insère une ligne `notification_log`
   (visible en base ; log JSON « notification envoyée »).
4. **Idempotence** : rejouer le même `message_id` ne crée pas de doublon.
5. **DLQ** : si le handler échoue, le message atterrit dans `notification.events.dlq`
   (visible dans RabbitMQ UI :15672), sans rejeu infini.
