# Spec — Backend portail partenaire (service `partner`) + front branché

**Date :** 2026-08-10 · **Branche :** `feature/partner-portal-backend` (depuis `develop`)

## Objectif

Donner un vrai backend au portail partenaire m3a-l3achrane (aujourd'hui 8 écrans
100 % mockés) : un microservice `services/partner/` avec persistance, auth, et
un front branché offrant l'ajout/les actions attendus + un reporting enrichi.

**Acteur** : un partenaire = une institution (université / école / employeur) avec
des utilisateurs staff. Toutes les données sont cloisonnées à l'institution.

### Décisions actées (brainstorming)
- **Auth** : entité autonome + membership. Tables `Partner` + `PartnerMember` DANS
  le service. Autorisation par appartenance (`uid ∈ membres`), parité avec
  `coloc-listing` (`owner_id == uid`). **Aucun changement d'identity.**
- **Affiliés** = bénéficiaires (étudiants/salariés) parrainés par l'institution.
- **Clés API / webhooks** : pipeline COMPLET — auth entrante par clé API +
  worker de livraison de webhooks signés (HMAC) avec retries.
- Mono-tenant `m3a-l3achrane` (défense `_require_tenant`, patron coloc-listing).

## Architecture

Nouveau service `services/partner/` calqué sur `services/coloc-listing/`
(FastAPI + SQLAlchemy + Pydantic + outbox), port **8525**, schéma DB `partner`.
Gateway route `/api/v1/partner*` → service. Un worker (`app/worker.py`) consomme
les événements outbox et livre les webhooks. Front : les 8 écrans existants
(`frontend-m3a-l3achrane/src/surfaces/partner/`) branchés sur l'API réelle.

## Modèle de données (schéma `partner`)

- **Partner** : `id`(uuid str), `name`, `type`(UNIVERSITE|ECOLE|EMPLOYEUR),
  `tenant`(défaut m3a-l3achrane), `created_at`.
- **PartnerMember** : `id`, `partner_id`(FK), `user_id`(BigInteger, user identity),
  `role`(OWNER|STAFF), `created_at`. Unique(`partner_id`,`user_id`).
- **Affilie** (bénéficiaire) : `id`, `partner_id`, `full_name`, `email`,
  `external_ref`(nullable), `status`(PENDING|ACTIVE|INACTIVE), `created_at`.
- **Verification** : `id`, `partner_id`, `affilie_id`(FK), `doc_type`
  (CIN|CARTE_ETUDIANT|ATTESTATION_EMPLOYEUR|AUTRE), `status`
  (PENDING|APPROVED|REJECTED), `note`(nullable), `submitted_at`, `decided_at`,
  `decided_by`(user_id, nullable).
- **Reservation** (offre réservée = pré-réservation d'un logement) : `id`,
  `partner_id`, `listing_id`(str, réf annonce coloc), `affilie_id`(nullable),
  `label`, `start_date`, `end_date`, `status`(RESERVED|RELEASED|CONVERTED),
  `created_at`.
- **Grant** (subvention) : `id`, `partner_id`, `program`, `affilie_id`(nullable),
  `amount`(Numeric 12,2), `currency`(MAD), `status`(PLANNED|PAID|CANCELLED),
  `created_at`.
- **Invoice** (facture) : `id`, `partner_id`, `number`, `period`(str "AAAA-MM"),
  `amount`(Numeric 12,2), `currency`(MAD), `status`(DRAFT|SENT|PAID|OVERDUE),
  `issued_at`(nullable), `created_at`.
- **ApiKey** : `id`, `partner_id`, `label`, `prefix`(8 car. affichés),
  `key_hash`(sha256), `last_used_at`(nullable), `created_at`, `revoked_at`(nullable).
  Le secret brut n'est renvoyé QU'À la création.
- **Webhook** : `id`, `partner_id`, `url`, `events`(JSON list), `secret`(HMAC),
  `active`(bool), `created_at`.
- **WebhookDelivery** (journal/retries) : `id`, `webhook_id`, `event_type`,
  `payload`(JSON), `status`(PENDING|DELIVERED|FAILED), `attempts`(int),
  `last_attempt_at`, `response_code`(nullable), `created_at`.

Tous les `to_dict()` excluent `key_hash` et `secret` bruts (jamais sérialisés
vers le client au-delà de l'affichage prévu : `prefix` pour les clés, `secret`
seulement à la création du webhook).

## Authentification & autorisation

Dépendance unifiée `partner_ctx` (résout le contexte partenaire) acceptant DEUX
modes, dans l'ordre :
1. **Clé API** (serveur-à-serveur) : en-tête `X-Api-Key: <raw>` → sha256 →
   `ApiKey` non révoquée → `partner_id`. Met à jour `last_used_at`.
2. **Session utilisateur** (BFF) : `get_principal` → `_uid` → `PartnerMember`
   du user → `partner_id`. Si le user n'est membre d'aucun partenaire → 403.
Le superadmin (`principal.is_superadmin`) peut cibler n'importe quel partenaire
(supervision back-office) via `?partner_id=`.
`_require_tenant` (mono-tenant) sur toutes les routes métier.

Sécurité clés API : générées côté serveur (`secrets.token_urlsafe(32)`),
stockées en `sha256` uniquement, `prefix` pour l'affichage, révocables
(`revoked_at`). Le brut n'est montré qu'une fois (réponse de création).

## Endpoints (préfixe `/partner`, exposés `/api/v1/partner*`)

- `GET /partner/me` → partenaire du contexte.
- **Affiliés** : `GET /partner/affilies`, `POST /partner/affilies`,
  `PATCH /partner/affilies/{id}`.
- **Vérifications** : `GET /partner/verifications`, `POST /partner/verifications`
  (pour un affilié), `POST /partner/verifications/{id}/approve`,
  `POST /partner/verifications/{id}/reject`.
- **Réservations** : `GET /partner/reservations`, `POST /partner/reservations`,
  `POST /partner/reservations/{id}/release`.
- **Subventions** : `GET /partner/grants`, `POST /partner/grants`,
  `PATCH /partner/grants/{id}` (statut).
- **Factures** : `GET /partner/invoices`, `POST /partner/invoices`,
  `PATCH /partner/invoices/{id}` (statut).
- **Clés API** : `GET /partner/api-keys`, `POST /partner/api-keys`
  (renvoie le brut une fois), `DELETE /partner/api-keys/{id}` (révoque).
- **Webhooks** : `GET /partner/webhooks`, `POST /partner/webhooks`,
  `PATCH /partner/webhooks/{id}`, `DELETE /partner/webhooks/{id}`,
  `POST /partner/webhooks/{id}/test` (ping signé immédiat).
- **Reporting** : `GET /partner/reporting` → KPIs + séries agrégées du partenaire.
- **Interne** : `GET /internal/stats` (garde `x-internal-token`) pour
  `backoffice_overview`.

Toutes les écritures pertinentes émettent un événement outbox
(`partner.affilie_created`, `partner.verification_decided`,
`partner.reservation_created`, `partner.grant_paid`, `partner.invoice_sent`…)
via `enqueue(...)` dans la transaction.

## Webhooks — livraison signée avec retries (`app/worker.py`)

- Le relais outbox (`app/relay.py`, `run_relay`) publie les événements sur
  RabbitMQ (patron coloc-listing).
- Le worker consomme ces événements ; pour chaque `Webhook` `active` du partenaire
  abonné à `event_type`, crée un `WebhookDelivery`(PENDING) puis POST l'URL avec
  en-tête `X-Partner-Signature: sha256=<hmac(secret, body)>` et
  `X-Partner-Event: <type>`. Sur échec (statut ≥ 400 / timeout), retries avec
  backoff exponentiel (ex. 3 tentatives), `attempts`/`status`/`response_code`
  mis à jour ; FAILED après épuisement.
- `POST /partner/webhooks/{id}/test` : livre immédiatement un événement
  `partner.test` signé (hors worker), pour valider l'intégration.

## Reporting enrichi (`GET /partner/reporting` + front)

Agrégats cloisonnés au partenaire : total affiliés par statut ; entonnoir de
vérifications (pending/approved/rejected + taux) ; réservations actives/libérées ;
subventions (montant total Đh + nombre par statut) ; factures (encours,
payées) ; répartition par ville des réservations. Front : tableau de bord avec
graphiques (skill `dataviz` : barres/entonnoir/tuiles KPI), thème m3a, `Đh`.

## Plomberie (câblage plateforme)

- **Gateway** : `gateway/app/config.py` → `partner_url: str | None = None` ;
  `gateway/app/main.py` → `app.state.partner = _client_or_none(settings.partner_url)`
  (lifespan + fermeture) ; branche `_resolve_upstream` :
  `path == "/api/v1/partner" or path.startswith("/api/v1/partner/")` →
  `app.state.partner`. Brancher `app_.state.partner` dans `backoffice_overview`.
- **Dev mesh** : `scripts/dev-mesh-up.sh` → `SVCS` (`partner:8525`), boucles
  relay+worker, `PARTNER_URL=http://localhost:8525` dans le bloc BFF.
- **CI** : `.github/workflows/ci.yml` → ajouter `services/partner` à la liste `ALL`.
- **Prod** : `infra/prod/ansible/roles/mesh/vars/main.yml` → `mesh_apps`
  (`{name: partner, port: 8525}`) + `mesh_relays` + `mesh_workers`. (Note :
  coloc-listing/matching manquent déjà de ce fichier — dérive prod préexistante
  signalée, non corrigée ici au-delà d'ajouter `partner`.)
- **DB** : `services/partner/db/schema.sql` (rôle+schéma `partner`, ADR-0002).
- **Seed** : `services/partner/app/seed_demo.py` — 1 partenaire de démo + 1
  membership (user de démo) + quelques affiliés/vérifications/réservations/
  subventions/factures, pour un portail utilisable en démo.

## Frontend (branchement des 8 écrans)

`frontend-m3a-l3achrane/src` :
- `services/index.js` : fonctions API partenaire (list/create/actions par ressource)
  remplaçant les mocks `data/partners.js` / `data/partnerExtras.js`.
- Écrans `surfaces/partner/*` : chaque liste chargée depuis l'API + formulaires
  d'ajout (modale/section) et actions (approuver/rejeter, libérer, révoquer,
  tester webhook, générer clé API affichée une fois).
- `Reporting.jsx` : tableau de bord enrichi (graphiques via dataviz).
- Contexte partenaire : si l'API renvoie 403 (user non membre), afficher un état
  « accès partenaire requis » ; le seed fournit un user membre pour la démo.
- i18n FR + AR (parité) pour toutes les nouvelles chaînes ; devise `Đh`.

## Tests

- **Backend** (`services/partner/tests/`, fixtures client/db_session/headers) :
  membership/autorisation (403 si non membre, cloisonnement partner_id) ; CRUD de
  chaque ressource ; approve/reject vérification ; release réservation ; clé API
  (création renvoie le brut une fois, hash stocké, révocation) ; auth par clé API
  (X-Api-Key valide/révoquée) ; webhook test signé (signature HMAC correcte) ;
  worker de livraison (retry/statut — testé en unité sur la fonction de livraison,
  sans réseau réel) ; reporting agrégats ; `/internal/stats`.
- **Front** : services mappent l'API ; formulaires (champs requis, skill
  form-design) ; parité i18n FR/AR ; `Đh`.

## Sécurité & non-régression

- Clés API : jamais stockées ni reloggées en clair ; secret webhook jamais
  resérialisé après création ; signatures HMAC constantes-temps (`hmac.compare_digest`).
- Cloisonnement strict par `partner_id` sur TOUTE lecture/écriture (un partenaire
  ne voit jamais les données d'un autre).
- `_require_tenant` sur toutes les routes métier ; garde `x-internal-token` sur
  `/internal/*`.
- Pas de secret en dur ; pas d'attribution IA dans les commits.

## Hors périmètre (v-suivantes)

- Écran de login/rôle partenaire dédié côté identity (on reste sur membership +
  API key ; un user devient membre via seed/superadmin).
- Facturation réellement générée/branchée sur un provider de paiement (les
  factures sont saisies/gérées, pas encaissées).
- Rattrapage complet de la dérive prod Ansible pour coloc-listing/matching.
