# ADR-0002 — PostgreSQL natif (jamais conteneurisé)

- **Statut :** accepté

## Décision

PostgreSQL est la **source de vérité** et tourne **en natif** sur l'hôte (jamais dans un
conteneur), en dev comme en prod. Les conteneurs n'hébergent que des composants **sans état
critique** ou **reconstructibles** (RabbitMQ, MinIO, OpenSearch, observabilité) et Redis (cache).

## Justification

- Durabilité et perf I/O prévisibles ; sauvegardes/PITR maîtrisées hors cycle de vie conteneur.
- Aligné avec l'architecture de référence m3a (« PostgreSQL jamais conteneurisé §5 »).

## Règles

- Un **schéma** + un **rôle** PostgreSQL par service ; aucun accès croisé aux tables d'un autre service.
- Extensions : `postgis` (geo), `pgvector` (recherche/matching), `pgcrypto`.
- `infra/docker-compose.yml` **ne doit jamais** déclarer de service `postgres`.
- Les services se connectent à Postgres via `DATABASE_URL` (hôte natif), avec le rôle du service.
