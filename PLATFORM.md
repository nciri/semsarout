# SemsarOut — Plateforme v2

Architecture cible atteinte (`docs/architecture-v2.md`, `docs/architecture-v2.drawio`, `docs/adr/`).
Le **strangler est terminé** : le **monolithe Flask `backend/` est décommissionné** et le mesh
FastAPI (**30 services** + BFF) sert **100 % du front**. `backend/` reste dans l'arbre à titre de
référence historique (cible du proxy pendant la migration), **plus démarré**.

```
libs/          semsar_common · semsar_auth · semsar_events · semsar_storage · semsar_search · semsar_signing   (socle partagé)
gateway/       BFF/gateway — réexpose /api/v1 à l'identique (ADR-0003), entrée unique (:8099)
services/      les 30 services (gabarit dans _template/) — voir la liste dans docs/architecture-v2-status.md §2
infra/         docker-compose (RabbitMQ · MinIO · OpenSearch · OTel · Prometheus · Grafana · Loki)
docs/adr/      décisions d'architecture (ADR-0001..0005)
frontend/      SPA React SemsarOut (immobilier)
frontend-m3a-l3achrane/  SPA React M3a-L3achrane (colocation)
backend/       monolithe Flask — DÉCOMMISSIONNÉ (référence historique, non démarré)
```

> **PostgreSQL est natif** (jamais conteneurisé — ADR-0002). **Redis** reste géré par le
> `docker-compose.yml` racine (port 6379).

## Démarrer toute la stack (dev)

Un seul script démarre l'infra + les 30 services + le BFF + les relais/workers/ordonnanceur,
puis affiche la santé de chaque service. Idempotent (tue les ports puis relance).

```bash
# Prérequis : PostgreSQL natif (:5432, base semsar_dev), et JWT_SECRET_KEY dans .env (gitignoré).
# La 1re fois, provisionner chaque service : psql -f services/<svc>/db/schema.sql
#   (+ migrate_from_monolith.sql / migrations incrémentales quand présentes).
bash scripts/dev-mesh-up.sh
#   Infra : RabbitMQ UI :15672 · MinIO :9001 · OpenSearch :9200
#   BFF   : http://localhost:8099  ·  Frontend SemsarOut : http://localhost:5600
#   Logs  : ${TMPDIR:-/tmp}/semsar-mesh/
```

Le frontend (vite) proxifie `/api` et `/uploads` vers le BFF (`:8099`). Le monolithe n'est **plus**
démarré (décommissionné) ; pour rejouer les tests de contrat historiques, le relancer manuellement
(voir `scripts/dev-mesh-up.sh` §2) puis `python3 tools/contract_test.py`.

## Tester le gateway

```bash
pip install -e gateway pytest
pytest gateway/tests
```

## Vérifier la parité / la santé

`tools/contract_test.py` compare route par route (statut + JSON normalisé). L'état de la migration,
la liste complète des services et le reste à faire sont dans `docs/architecture-v2-status.md`.
