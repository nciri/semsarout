# SemsarOut — Plateforme v2 (fondations)

Structure additive introduite en **Phase 0** de la migration vers l'architecture cible
(`docs/architecture-v2.md`, `docs/architecture-v2.drawio`, `docs/adr/`). **Le monolithe
`backend/` et le `frontend/` continuent de tourner sans modification.**

```
libs/          semsar_common · semsar_auth · semsar_events · semsar_storage · semsar_search   (socle partagé)
gateway/       BFF/gateway — réexpose /api/v1 à l'identique (ADR-0003)
services/      les 18 services cibles (gabarit dans _template/)
infra/         docker-compose (RabbitMQ · MinIO · OTel · Prometheus · Grafana · Loki)
docs/adr/      décisions d'architecture (ADR-0001..0003)
backend/       monolithe Flask (existant, cible du proxy) — inchangé
frontend/      SPA React (existant) — inchangé
```

> **PostgreSQL est natif** (jamais conteneurisé — ADR-0002). **Redis** reste géré par le
> `docker-compose.yml` racine (port 6379).

## Démarrer les fondations (dev)

```bash
# 1) Infra plateforme (hors Postgres, hors Redis)
cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yml up -d
#   RabbitMQ UI :15672 · MinIO :9001 · Prometheus :9090 · Grafana :3001 · Loki :3100 · OTLP :4318

# 2) Libs partagées (éditable)
pip install -e libs/semsar_common -e libs/semsar_auth -e libs/semsar_events

# 3) Monolithe Flask (existant) sur :7000
(cd backend && python run.py)

# 4) BFF/gateway sur :8080 (proxifie /api/* vers :7000)
cp gateway/.env.example gateway/.env
pip install -e gateway
uvicorn app.main:app --app-dir gateway --host 0.0.0.0 --port 8080
```

Le frontend peut alors pointer `/api` vers le BFF (`:8080`) au lieu du monolithe (`:7000`) —
via le proxy Vite en dev, sans changer un seul écran. Réponses identiques garanties par les
tests de contrat (ADR-0003).

## Tester le gateway

```bash
pip install -e gateway pytest
pytest gateway/tests
```

## Étapes suivantes (Phase 1+)

Voir `docs/architecture-v2.md` §8 : projections OpenSearch/analytics, médias→MinIO + WORM,
puis extraction des services (`services/`), un à la fois, derrière le BFF.
