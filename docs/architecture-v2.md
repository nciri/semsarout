# SemsarOut — Architecture cible v2

> **Statut :** cible **validée**. **Décisions actées :** services en **FastAPI** · découpage
> **complet (18 services)** · **toutes** les priorités métier retenues (recherche OpenSearch,
> WORM contrats/juridique, séquestre CMI, KYC/CIN). **Contrainte structurante :** le frontend
> React existant (SPA aboutie) n'est **pas modifié** — la cible préserve le contrat `/api/v1`.
> **Inspiration :** architecture m3a-l3achrane (`docs/m3a-architecture.drawio`), transposée
> au domaine immobilier de SemsarOut. **Diagramme :** `docs/architecture-v2.drawio`.

---

## 1. Objectif

Faire évoluer le backend **monolithe Flask** actuel vers une architecture **orientée services,
événementielle et observable**, dans le même esprit que m3a, **sans casser le frontend** ni
les écrans existants. Le résultat cible : des domaines isolés (1 schéma + 1 rôle PostgreSQL
chacun), un bus d'événements, des projections reconstructibles (recherche, analytics), et une
conformité renforcée (archivage probatoire, KYC, séquestre, signature).

## 2. Principes repris de m3a (adaptés)

| Principe m3a | Transposition SemsarOut |
|---|---|
| Traefik v3 en entrée unique (TLS, rate-limit, CORS) | Idem — une seule origine publique |
| **Gateway / BFF** (agrégation, validation JWT, propagation de trace) | **Réexpose `/api/v1`** à l'identique → **front intact** |
| Services FastAPI, **1 schéma + 1 rôle PG / service**, *outbox* transactionnel | Découpage par domaine métier immobilier |
| **RabbitMQ** topic, file + DLQ / service, livraison ≥ 1, consumers idempotents | Bus `semsar.events` |
| **PostgreSQL natif** = source de vérité ; **projections reconstructibles** | OpenSearch (recherche/carte), agrégats analytics |
| Redis (cache · Celery · nonce anti-rejeu) | Déjà présent (Celery configuré) → généralisé |
| MinIO/S3 + **bucket WORM** (archivage probatoire) | Contrats + dossiers juridiques/notaires |
| Observabilité **OTel + Prometheus/Grafana/Loki** | Traces, métriques RED, logs JSON |
| Libs partagées (RFC 9457, i18n, tracing, auth, SDK partenaire) | `semsar_common`, `semsar_events`, `semsar_auth`, `semsar_partner_sdk` |
| Intégrations : KYC (CIN), e-signature, séquestre CMI, SMS/WhatsApp | Vérif agents/propriétaires, contrats, transactions, OTP |
| Gouvernance par **ADR** | `docs/adr/ADR-XXXX-*.md` |

## 3. Le pivot « frontend intact » : le BFF

Le SPA React appelle `/api/v1/...` (axios, JWT + refresh auto, React Query). En cible :

```
Navigateur (React SPA, inchangé)
        │  /api/v1/*  (JWT Bearer)
        ▼
   Traefik v3  ──►  Gateway / BFF  ──►  services internes (REST v1 + événements)
```

- Le **BFF conserve chaque route et chaque forme de réponse** attendue par le front.
- Il **agrège** les lectures transverses déjà agrégées côté front :
  `GET /api/v1/backoffice/analytics/overview` (tour de contrôle), fiche annonce (bien +
  positionnement prix + contacts intéressés), `/me/*`.
- Garanties de non-régression : **tests de contrat** + **snapshots OpenAPI** sur `/api/v1`.
- L'auth passe à **JWT RS256** (clé asymétrique, vérifiable par chaque service) mais reste
  transparente pour le front : mêmes endpoints `/auth/login` · `/auth/refresh`, même stockage token.

## 4. Découpage en services (cible)

Mapping des domaines actuels (modèles / blueprints) → services cibles. Chaque service : FastAPI,
schéma + rôle PG dédié, *outbox*, publie/consomme des événements.

| Service | Domaine (modèles actuels) | Rôle |
|---|---|---|
| **identity** | `user`, `role`, `team`, `invitation` | OTP/login, JWT RS256, RBAC, sièges/équipes, **vérif CIN (KYC)** |
| **agency** | `agency` | Profils agences, membres, abonnement (lien billing) |
| **listing** | `property`, `program` (+ units/plans/lots), médias | Cycle de vie annonces & programmes ; médias → MinIO |
| **geo** | `market` (réf. prix quartier) | Référentiel PostGIS (régions, POI), positionnement prix |
| **search** | — (projection) | Index **OpenSearch** recherche + filtres + carte (reconstructible) |
| **crm** | `client`, `lead`, `visit`, `transaction` | Back-office : clients, leads, pipeline, visites, transactions |
| **messaging** | messages acheteur ↔ agence | Conversations, prise de RDV (WS possible) |
| **notification** | (mailer, alertes) | Email (Brevo/SMTP), **SMS/WhatsApp OTP**, alertes recherche (scheduler) |
| **buyer** | `buyer`, estimations | Favoris, recherches sauvegardées, estimations |
| **contract** | `contract` | Contrats, **e-signature**, archivage **WORM** |
| **legal** | `legal` (notaires, dossiers, checklists) | Suivi juridique ; docs → WORM |
| **billing** | `subscription`, factures | Abonnements, factures, plans/flags |
| **payment** | commandes marketplace, paiements | **Séquestre CMI**, encaissement, frais |
| **marketplace** | `shop` (produits, panier, commandes) | Boutique mobilier/électroménager hôtes |
| **directory** | `artisan` (artisans + interventions) | Annuaire artisans, bons de travaux |
| **trust-safety** | (super-admin) | Modération, suspension, impersonation auditée, avis |
| **analytics** | (dashboard/analyses) | Agrégats k-anonymisés (projection reconstructible) |
| **integrations / ingestion** | `staymanager` | Connecteurs partenaires (StayManager…), HMAC, webhooks, quarantaine/rejeu |

> **Note de pragmatisme :** on ne crée pas 18 services d'un coup. Voir le chemin de migration (§8) :
> on démarre en **monolithe modulaire** avec ces frontières logiques, et on **extrait par valeur**.

## 5. Données & projections

- **PostgreSQL natif = source de vérité.** 1 **schéma** + 1 **rôle** par service (isolation forte,
  pas d'accès croisé aux tables). Extensions : `postgis` (geo), `pgvector` (recherche/matching futur),
  `pgcrypto`.
- **Outbox transactionnel** : chaque service écrit ses événements dans une table `outbox` dans la
  **même transaction** que la donnée ; un relais publie vers RabbitMQ (garantie « au moins une fois »).
- **Consumers idempotents** (clé d'idempotence / dédup) côté abonnés.
- **Projections reconstructibles** (jamais source de vérité, rejouables depuis les événements) :
  **OpenSearch** (recherche/carte), **agrégats analytics**.
- **Redis** : cache, broker Celery (alertes/planifié), nonce anti-rejeu (HMAC partenaires).
- **MinIO/S3** : médias (photos publiques, docs authentifiés) + **bucket WORM** pour contrats et
  dossiers notaires (valeur probante).

## 6. Sécurité & conformité

- **JWT RS256** (asymétrique) + **RBAC** centralisé (`semsar_auth`) ; le super-admin reste hors
  périmètre agence (déjà en place).
- **HMAC** signé pour les partenaires (StayManager et futurs), **nonce anti-rejeu**.
- **KYC / CIN** (via un fournisseur type Didit) pour agents & propriétaires — réduction de fraude.
- **E-signature** des contrats (brique contrats déjà livrée) → provider (3a9dSign/équivalent).
- **Séquestre CMI** pour transactions & marketplace (pattern paiement de m3a).
- **WORM** (Write-Once-Read-Many) pour l'archivage probatoire contrats/juridique.
- **Erreurs RFC 9457** (problem+json) uniformes ; **i18n FR/AR**.

## 7. Observabilité

- **OpenTelemetry** : traces distribuées OTLP (BFF → services → base), propagation du contexte.
- **Prometheus** (métriques RED via `/metrics`) + **Grafana** (dashboards) + **Loki** (logs JSON).
- SLOs par service ; DLQ surveillées (alerte sur file morte).

## 8. Chemin de migration (strangler — sans casser le front)

**Phase 0 — Fondations (aucun découpage encore).**
Traefik + **BFF devant le monolithe Flask** (passe `/api/v1` tel quel) ; OTel/Prometheus/Grafana/Loki ;
extraction des **libs partagées** (`semsar_common` erreurs RFC 9457 / tracing, `semsar_auth`) ;
introduction **outbox + RabbitMQ** ; passage à **schémas PG par domaine** (même base, séparation logique).
→ *Frontend intact.*

**Phase 1 — Projections additives (faible risque).**
Lever **OpenSearch** (projection recherche) et **analytics** comme consumers ; **médias → MinIO**,
**contrats/juridique → WORM**. Reconstructibles, réversibles.

**Phase 2 — Premiers services extraits (valeur/frontières nettes).**
`identity` (auth/JWT RS256/KYC) → `notification` → `contract`+`legal` (WORM/e-sign) →
`billing`+`payment` (séquestre CMI). Chacun derrière le BFF ; contrat `/api/v1` stable.

**Phase 3 — Découpage des domaines cœur.**
`listing`, `geo`, `search`, `crm`, `messaging`, `marketplace`, `directory`, `trust-safety`,
`agency`, `integrations`. Migration **service par service** en FastAPI.

**Phase 4 — Décommissionnement du monolithe.**
Durcissement schéma+rôle par service, tout événementiel, DLQ/retries, ADRs figés.

## 9. Décisions actées

1. **Langage des services** : **FastAPI** (async, OpenAPI natif, aligné m3a) pour tous les services.
   Le monolithe Flask subsiste uniquement le temps du strangler (§8), puis est décommissionné.
2. **Profondeur du découpage** : **cible complète — les 18 services** du §4 (pas de regroupement).
   Le strangler (§8) permet d'y arriver sans big-bang, un service à la fois.
3. **Priorités métier** : **toutes** retenues — recherche **OpenSearch**, **WORM** contrats/juridique,
   **séquestre CMI**, **KYC/CIN** (+ e-signature, SMS/WhatsApp). Séquençage d'exécution : voir §8.

---

*Diagramme cible : `docs/architecture-v2.drawio` (même format que la référence m3a).*
