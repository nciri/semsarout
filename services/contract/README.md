# service contract

Rédaction des contrats + **archivage WORM** (valeur probante). Branche la lib
`semsar_storage` sur un cas réel : à la **finalisation**, le document est écrit dans le
bucket WORM (immuable, Object Lock COMPLIANCE), `worm_key` est enregistré, et
`contract.finalized` est émis via l'**outbox**. Schéma + rôle PostgreSQL dédiés (ADR-0002).
Toutes les routes sont **cloisonnées par agence** (issue du JWT).

## Démarrer (dev)

```bash
psql "$ADMIN_DATABASE_URL" -f db/schema.sql
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e ../../libs/semsar_events -e ../../libs/semsar_storage -e .

uvicorn app.main:app --host 0.0.0.0 --port 8005   # API (JWT_PUBLIC_KEY requis)
python -m app.relay                                # relais outbox -> RabbitMQ
```

## Flux WORM

```
POST /contract/contracts            -> brouillon
POST /contract/contracts/{id}/finalize
      -> archive le document dans le bucket WORM (immuable)   [semsar_storage]
      -> statut = finalized, worm_key enregistré
      -> émet contract.finalized (outbox -> RabbitMQ)
```

Un objet archivé ne peut plus être modifié ni supprimé avant l'échéance de rétention,
y compris par un administrateur — c'est la garantie probante pour contrats et actes.

> Le BFF route `/api/v1/contract/*` ici (surface additive). La migration des routes
> existantes `/api/v1/backoffice/contrats` se fait ensuite, avec tests de contrat (ADR-0003).
