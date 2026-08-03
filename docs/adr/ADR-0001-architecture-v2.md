# ADR-0001 — Adoption de l'architecture cible v2

- **Statut :** accepté — **partiellement amendé par [ADR-0005](ADR-0005-ecarts-as-built.md)**
  (écarts as-built : HS256 au lieu de RS256, 22 services, erreurs legacy, analytics query-time, pas de Traefik).
- **Contexte :** voir `docs/architecture-v2.md` et `docs/architecture-v2.drawio`.

## Décision

Faire évoluer le backend monolithe Flask vers une architecture **orientée services,
événementielle et observable**, en **19 services FastAPI**, **sans modifier le frontend**
(le contrat `/api/v1` est préservé par un **BFF**).

### Choix actés

1. **Langage services :** FastAPI (async, OpenAPI natif). Le monolithe Flask subsiste le
   temps du strangler puis est décommissionné.
2. **Découpage :** 19 services (cf. §4 du doc cible), atteints progressivement (strangler).
3. **Données :** PostgreSQL **natif** (jamais conteneurisé, cf. ADR-0002), 1 schéma + 1 rôle
   par service, **outbox transactionnel**, projections reconstructibles (OpenSearch, analytics).
4. **Bus :** RabbitMQ (topic `semsar.events`, file + DLQ par service, livraison ≥ 1,
   consumers idempotents).
5. **Contrat frontend :** le BFF réexpose `/api/v1` **à l'identique** (cf. ADR-0003).
6. **Sécurité :** JWT **RS256**, RBAC, HMAC partenaires ; KYC/CIN, e-signature, séquestre CMI, WORM.
7. **Observabilité :** OpenTelemetry + Prometheus/Grafana/Loki.
8. **Erreurs :** RFC 9457 (`application/problem+json`) uniformes ; i18n FR/AR.

## Conséquences

- **+** Isolation des domaines, montée en charge par service, résilience (DLQ), traçabilité.
- **+** Frontend inchangé pendant toute la migration.
- **−** Complexité opérationnelle accrue (bus, projections, observabilité) — mitigée par les
  libs partagées et une migration strangler par étapes.

## Phase 0 (cette étape)

Fondations **additives** (le monolithe et le front continuent de tourner) :
monorepo (`libs/`, `gateway/`, `services/`, `infra/`), libs partagées
(`semsar_common`, `semsar_auth`, `semsar_events`), **BFF** proxifiant le monolithe,
infra dev (RabbitMQ, MinIO, OTel, Prometheus, Grafana, Loki ; PostgreSQL natif, Redis existant).
