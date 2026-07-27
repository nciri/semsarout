# Migration v2 — État & reprise (handoff)

> **But de ce document** : permettre de reprendre le chantier v2 avec un contexte vierge.
> Décrit ce qui est fait, ce qui tourne, comment tout relancer, et le reste à faire.
> Branche : `feature/architecture-v2` (commits **locaux uniquement**, aucun upstream, aucun push).

Dernière mise à jour de session : contrat **88/88 PASS**. #6 : **T1..T5 FAITS** (toutes les tranches de service). staymanager extrait (`services/staymanager` :8517). Reste : divers (selling/leads racine/users/admin — surfaces mineures) + **coupure finale** (retirer le repli monolithe du BFF, éteindre :7000).

> **REPRISE (contexte frais)** — §8 items #1, #2, #5 **FAITS** ; **#4 `transactions` FAIT** ;
> **`legal` FAIT** ; **`contract` FAIT** (tranches de #3, vérifiés E2E + gates 403 + create/finalize,
> contrat 48/48). `services/transactions` (:8514) reroute `/backoffice/transactions*`, émet
> `transaction.*`. `services/legal` (:8506) et `services/contract` (:8505) **réécrits pour servir les
> routes legacy** (`/backoffice/notaries*`+`/legal-cases*`+`/legal-tasks*` ;
> `/backoffice/contracts*`+`/finalize`/`/mark-signed`/`/pdf`+`/contract-templates*`) à l'identique,
> gate premium via `Principal.features` (`legal` / `contracts`).
> **Entitlement plan Entreprise** : `can_manage_templates` (gestion des modèles) n'était pas
> distinguable dans le JWT (Pro et Entreprise ont les mêmes flags) → ajout d'un entitlement de
> capacité **`contract_templates`** dans `agency_ro.features` (identity, migration) pour le plan
> Entreprise ; il circule dans tout le pipeline features existant (JWT→BFF→Principal). Pas de
> dépendance monolithe (archi v2).
> **Finalisation contract** : PDF (xhtml2pdf) archivé en stockage objet (MinIO), et la copie dans les
> documents de la transaction est **déléguée** via `contract.finalized`/`contract.signed` →
> worker transactions crée/maj le `TransactionDocument` (vérifié E2E : create+sign propagés).
> **Fix mesh** : `message_id` d'outbox namespacé par `aggregate_type`
> (`libs/semsar_events/…/outbox.py`) — sans ça, un consumer multi-publisher (crm/legal/contract =
> listing.* + transaction.* ; transactions = listing.* + contract.*) collisionnait sur les id
> d'outbox locaux (relais existants rechargent la lib au prochain `dev-mesh-up.sh`).
> **Dépendances runtime ajoutées** (system python3) : `bleach`, `xhtml2pdf` (contract), `python-slugify` (programs).
> **`billing` FAIT** : `services/billing` (:8508) réécrit pour servir les routes legacy
> `/subscription-plans`(+`/{id}`), `/my-subscription`, `/subscription/current`,
> `/cancel-subscription`, `/subscription/change-plan`. **Découverte** : le monolithe **500ait** sur
> `change-plan` (happy path) car `payment_methods`/`invoices` **n'existent pas** en base — v2 le rend
> fonctionnel (validation plan 404 + garde-fou sièges 409 + bascule *incomplete* + facture *unpaid* +
> `billing.invoice.created`). Le garde-fou de rétrogradation lit les sièges/équipes via un **endpoint
> interne d'identity** (`GET /internal/agency/{id}/seats`, v2-native, pas le monolithe). Écart assumé :
> les features de gating restent projetées par identity (`agency_ro.features`), billing ne les pilote
> pas encore.
> **`payment` FAIT** : `services/payment` (:8507) réécrit pour servir `/payments/create-intent`,
> `/payments/webhook`, `/payments/{reference}`, `/my-payments` (passerelle CMI simulée, comme le
> monolithe). Montant d'abonnement via projection locale `plan_ro` (prix par slug). Le webhook confirmé
> émet `payment.completed` → **worker billing crée/prolonge l'abonnement** (v2-native, sans écriture
> cross-domaine) — vérifié E2E (create-intent service+plan, webhook → +365 j). `create-intent` est en
> auth optionnelle (identité lue des en-têtes `x-semsar-*` si présentes).
> **TOUTES les tranches de service sont FAITES.** Reste : **#6 décommissionnement** — pointer 100 %
> du proxy front → BFF (le monolithe ne sert plus que les ~240 routes non encore extraites : voir §8.4
> `programs`/`buyer`/`dashboards`/`analytics`/`integrations`), puis éteindre le monolithe quand tout
> est extrait. Prérequis avant coupure : relancer `dev-mesh-up.sh` (recharge la lib outbox partout).
> Findings clés : gating premium lu dans le JWT (`Principal.features`) → legal/contract **ne dépendent
> pas** d'une projection billing pour le 403 ; `/payment-methods` = non-feature (table absente du
> monolithe → 404, ne pas router). Détail complet en §8.3/§8.4. Décisions utilisateur : #3 = reproduire
> les routes legacy ; #4 = tout extraire ; #6 = coupure auto autorisée si contrat vert.

---

## 1. Vision cible (rappel)
Décommissionner le monolithe Flask, ne garder que des **microservices FastAPI** + le BFF +
les frontaux existants avec un minimum de changements. Le BFF réexpose `/api/v1` **à
l'identique** (front intact). Chaque service : schéma + rôle Postgres dédiés (ADR-0002),
événementiel RabbitMQ (outbox transactionnel + consumers idempotents + projections
reconstructibles). Validation JWT **locale** au BFF (frontière d'auth sévrée).

## 2. Ce qui est FAIT (services extraits, à parité 33/33)

**Services qui reroutent des routes existantes du front (parité de contrat) :**
| Service | Port | Domaine |
|---|---|---|
| catalog | 8009 | boutique produits (`/backoffice/shop/products`, `/admin/products`) |
| marketplace | 8010 | panier/commandes (`/backoffice/shop/cart|orders`, `/admin/orders`) |
| directory | 8011 | artisans/travaux (`/backoffice/artisans|work-orders|artisan-trades`) |
| listing | 8012 | biens : détail/CRUD/publish/my-properties + engagement (contact/reveal-phone) + `internal/properties` (dicts complets pour buyer/agency) |
| crm | 8013 | leads/clients/visites (`/backoffice/leads|clients|visits`) |
| search | 8103 | découverte biens (`GET /properties`, `/properties/search`, `/suggestions`) — OpenSearch |
| geo | 8509 | positionnement prix + `/market/neighborhood-prices` |
| messaging | 8510 | messages acheteur (`/buyer/messages`) |
| trust-safety | 8511 | modération comptes (`/admin/accounts/*/suspend|unsuspend`) + masquage souverain |
| agency | 8512 | agences lecture (`GET /agencies`, `/agencies/{slug}`, **`/my-agency`** +membres, **`/agencies/{slug}/properties`**) |
| audit | 8513 | journal transverse (`GET /admin/activity`) |
| transactions | 8514 | pipeline ventes/locations (`/backoffice/transactions*` : liste/pipeline/stats/stages/CRUD/move/offers/documents) |
| legal | 8506 | notaires + dossiers juridiques + checklists (`/backoffice/notaries*`, `/backoffice/legal-cases*`, `/backoffice/legal-tasks*`) — gate premium `legal` |
| contract | 8505 | modèles + contrats + fusion + finalisation PDF (`/backoffice/contracts*` +`/finalize`/`/mark-signed`/`/pdf`, `/backoffice/contract-templates*`) — gate premium `contracts` (+ `contract_templates`) |
| billing | 8508 | plans + abonnement (`/subscription-plans*`, `/my-subscription`, `/subscription/current`, `/cancel-subscription`, `/subscription/change-plan`) |
| payment | 8507 | intention de paiement + webhook (`/payments/create-intent`, `/payments/webhook`, `/payments/{ref}`, `/my-payments`) — CMI simulé |
| buyer | 8515 | acheteur : recherches sauvegardées + favoris + estimations (`/buyer/saved-searches*`, `/buyer/favorites*`, `/buyer/estimates*`) |
| staymanager | 8517 | intégration StayManager.ma (`/integrations/staymanager/*` : statut/connect/biens/réservations/sync/webhook) — gate `has_staymanager_sync` |
| programs | 8516 | programmes immobiliers neufs (`/programs*` : liste/détail/my + unités/images/plans/lots interactifs) — gate feature `has_programs` (billing) |
| identity | 8501 | **auth complète** (voir §3) + RBAC + teams/invitations + `dashboard/config` + `internal/agency/{id}/seats|members|analytics-scope` |
| analytics | 8504 | **tout dashboards/analytics/stats** query-time : `/analytics/*` (6) + `/stats/*` (6) + `/dashboard`+`/dashboard/charts/*`+`/dashboard/activity` — dumps internes transactions/crm/listing/geo/billing/audit + identity scope/seats |

**Services additifs (nouvelles surfaces, PAS consommées par le front — voir reste à faire) :**
identity(KYC) · notification 8502

## 3. Domaine identité/auth (le plus important, basculé)
`identity` (:8501) est **source de vérité** pour les comptes et **émet les JWT** :
- `POST /auth/login`, `/auth/refresh`, `GET/PUT/DELETE /auth/me`, `POST /auth/register`,
  `/auth/change-password` — tous servis par identity.
- Jetons forgés compatibles flask-jwt-extended (même secret HS256 `PURGED-DEV-SECRET`
  + claims enrichis `agency_id/is_superadmin/account_role/features`), acceptés par le monolithe
  **et** le BFF.
- RBAC : rôles/permissions (lecture + CRUD), users (assign-roles gated `seats`, activate/deactivate),
  teams + invitations. Logique `seats` relocalisée dans `services/identity/app/seats.py`.
- **Anti-escalation** : un manager ne peut accorder que des permissions qu'il détient (403 sinon) ;
  super-admin/owner exemptés. **IDOR** `GET /backoffice/roles/{id}` cloisonné par agence.

**Frontière d'auth locale** : le BFF valide le JWT localement (`JWT_SECRET_KEY` fourni), 0 appel
`/auth/me`. Repli monolithe pour les anciens jetons sans claims.

## 4. Inversions de propriété + sync (transition)
Le monolithe sert encore ~240 routes qui lisent `public.users`/`roles`/`activity_logs`. Donc :
- **identity → monolithe** : identity écrit users/roles → émet `user.*` / `role.*` → le consumer
  monolithe `backend/scripts/consume_users.py` resynchronise `public.users`, `user_roles`,
  `roles`, `role_permissions` en **SQL brut** (pas d'ORM → **anti-boucle**).
- **monolithe → identity** : suspensions (via trust-safety) écrivent `public.users` → `user.*`
  (outbox monolithe) → worker identity. Champs disjoints, idempotent, zéro conflit.
- **monolithe → audit** : chaque insert `ActivityLog` émet `audit.logged` (listener outbox) → worker audit.
- Projections lecture (`crm.property_ro`, `geo.listing_ro`, `agency.listing_ro`, etc.) maintenues
  par `listing.*` / `product.*`.

## 5. Mesh événementiel — RÉSILIENT
Tous les relais/consumers survivent aux redémarrages RabbitMQ (prouvé × 3) :
- `EventPublisher` : reconnexion + réessai backoff. `run_relay` : boucle de relais qui ne meurt jamais.
- `EventConsumer` : boucle de reconnexion. Scripts monolithe (pika brut) : mêmes boucles.
- Publishers (outbox+relay) : listing, catalog, identity, transactions (+ contract/payment/billing) + monolithe.
- Consumers (workers) : search, crm, marketplace, geo, agency, messaging, analytics, billing,
  notification, identity, audit, transactions, legal, contract, buyer + monolithe (`consume_users.py`).
- **Idempotence multi-publisher** : `message_id` d'outbox namespacé par `aggregate_type` (les id
  d'outbox sont locaux à chaque publisher ; crm/legal/contract consomment listing.* **et**
  transaction.*, transactions consomme listing.* **et** contract.*).
- **Effet cross-domaine contract→transactions** : `contract.finalized`/`.signed` (outbox contract) →
  worker transactions crée/maj le `TransactionDocument` (copie du PDF dans la transaction liée).
- **Chorégraphie paiement→abonnement** : `payment.released` (séquestre) **et** `payment.completed`
  (webhook) → worker billing active/prolonge l'abonnement de l'agence (billing pilote son domaine ;
  payment n'écrit jamais dans billing).

## 6. Infra & environnement
- **Postgres** natif :5432, base `semsar_dev`, admin `postgres:postgres`. Un rôle/schéma par
  service (`catalog:catalog`, …, `trust_safety:trust_safety`). Creds réelles via `.env` (gitignoré).
- **RabbitMQ** :5672 / UI :15672 (`semsar:semsar`) · **MinIO** :9000/:9001 · **OpenSearch** :9200.
  Lancés via `docker compose -f infra/docker-compose.yml up -d rabbitmq minio`.
- **Monolithe** : `cd backend && (set -a; source .env; set +a) && SEMSAR_OUTBOX_ENABLED=true venv/bin/python run.py`
  — Flask debug reloader (éditer le source recharge). `JWT_SECRET_KEY=PURGED-DEV-SECRET`.
- **BFF** : lancé avec `JWT_SECRET_KEY=PURGED-DEV-SECRET` + tous les `*_URL`. Port **8099**.
- **Frontend** :5600, `vite.config.js` proxy `/api` → `http://localhost:8099` (BFF).
- **Comptes de test** : `agent1@immo-casa-premium.ma`/`password123` (buyer, **owner** agence 1) ;
  `admin@semsarout.ma`/`admin123` (**super-admin**) ; staff agence `*@semsarout.ma`/`password123`.
- `INTERNAL_TOKEN=change-me-internal` (endpoints internes du monolithe).

## 7. Relancer toute la stack
Script : **`scripts/dev-mesh-up.sh`** (démarre infra + monolithe + tous les services + relais +
workers + consumers, puis affiche la santé). Migrations : chaque `services/<svc>/db/schema.sql`
puis `migrate_from_monolith.sql` (idempotents). Vérif : `tools/contract_test.py`.

```bash
bash scripts/dev-mesh-up.sh
# puis, token + contrat :
TOK=$(curl -s -XPOST localhost:8099/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"agent1@immo-casa-premium.ma","password":"password123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
python3 tools/contract_test.py --monolith http://localhost:7000 --bff http://localhost:8099 \
  --token "$TOK" --services catalog,directory,listing,search,crm,marketplace,geo,messaging,trust-safety,rbac,agency,audit,transactions,legal,contract,billing,payment,buyer --property-id 90 --legal-case-id 1
```

## 8. Reste à faire (priorisé)
1. ~~**Émettre `audit.logged` depuis identity**~~ ✅ **FAIT** — `services/identity/app/audit.py`
   émet `audit.logged` pour `update_user_roles` (parité : le monolithe ne traçait QUE
   `update_roles`), plus le CRUD des rôles (create/update/delete — nouveau, forward-looking).
   IDs tirés d'une **séquence dédiée** `identity.audit_log_seq` (plage disjointe `>9e12`) pour ne
   jamais collisionner avec `activity_logs.id` du monolithe (le service audit indexe l'idempotence
   sur cet id). Vérifié bout-en-bout : les 3 actions apparaissent dans `GET /admin/activity` avec
   le nom d'acteur résolu. Contrat 33/33 intact.
2. ~~**Répliquer les durcissements sécurité côté monolithe**~~ ✅ **FAIT** —
   `backend/app/api/v1/backoffice/roles.py` : `get_role` scope désormais par agence (rôle d'une
   autre agence -> 404, corrige l'IDOR de `get_or_404`) et `create_role`/`update_role` appliquent
   `_assert_grantable` (anti-escalation : un manager ne peut accorder que des permissions qu'il
   détient ; super-admin/owner exemptés) — miroir exact de la logique d'identity. Vérifié en direct
   contre le monolithe : IDOR 404 vs global 200 ; escalation 403 (perm non détenue) vs 201 (détenue).
   Contrat 33/33 intact.
3. **Brancher les services additifs** (contract/legal/billing/payment) — **décision : reproduire
   les routes du monolithe à l'identique** (front intact). Chaque service expose aujourd'hui des
   routes neuves (`/contract/*`, `/legal/*`, `/billing/*`, `/payment/*`) non consommées ; il faut
   servir les **routes legacy** que le front tape. Cartographie front → monolithe :
   - **contract** → `/backoffice/contracts*` (+ `/finalize`, `/mark-signed`, `/pdf`) et
     `/backoffice/contract-templates*` (`backend/app/api/v1/backoffice/contracts.py`).
   - **legal** → `/backoffice/notaries*`, `/backoffice/legal-cases*` (+ `/tasks`),
     `/backoffice/legal-tasks*` (`backend/app/api/v1/backoffice/legal.py`).
   - **billing** → `/subscription-plans`, `/subscription/current`, `/subscription/change-plan`,
     `/cancel-subscription` (`billing.py`+`subscriptions.py`). **`/payment-methods*` = non-feature**
     (table absente du monolithe → 404 ; parité = ne rien router).
   - **payment** → `/payments/create-intent` (`payments.py`).
   **Ordre de dépendances** : le gating premium se lit **depuis le JWT** (`Principal.features`
   contient `contracts`/`legal`/`artisans`) → legal & contract **ne dépendent PAS** d'une projection
   billing pour le 403. contract dépend en plus des **transactions (#4)** pour create/finalize
   (`Transaction`+`TransactionDocument`). Donc : **legal (autonome) → transactions(#4) → contract →
   billing → payment**. Chaque tranche = migration de projection (`migrate_from_monolith.sql`) +
   port fidèle des routes (scopé agence, erreurs `{'error'}`) + routage BFF + ajout au contrat.
   **Avancement** : ✅ **legal FAIT** ; ✅ **contract FAIT** (`services/legal`/`services/contract`
   réécrits en routes legacy, gates 403 vérifiés, projections via `transaction.*`/`listing.*`,
   contrat +7) ; ✅ **billing FAIT** (routes legacy, garde-fou sièges via identity, contrat +4) ; ✅ **payment FAIT** (routes legacy, webhook→billing, contrat +4) ;
   ✅ transactions (#4) FAIT. **Toutes les tranches de service faites** ; reste #6 (décommissionnement).
4. **Domaines non extraits** (périmètre : **tout**) : ~~`transactions` (14 routes)~~ ✅ **FAIT**
   (`services/transactions`, :8514, contrat 41/41) · `programs`
   (21 routes, nouveau dev) · `buyer`/estimations/favoris · `dashboards`/`analytics`/`stats` (front
   tape le monolithe) · `integrations` (staymanager) · `/dashboard/activity` · `/my-agency`
   (include_members) · `/agencies/{slug}/properties`. Priorité : ~~`transactions` d'abord (débloque
   contract)~~ fait, puis surfaces front-facing (dashboards/analytics, buyer/favoris, my-agency), puis
   `programs`/`integrations` (nouvelles surfaces). Chantier long, plusieurs tranches.
   **Note d'avancement** : #3/#4 mappés et priorisés ; **transactions extrait** (émet `transaction.*`,
   crm maintient `transaction_ro`). Écarts assumés (hors contrat de lecture) : audit create/stage_change
   non répliqué (comme crm) ; bascule `property.status=sold/rented` sur `won` (effet listing) différée ;
   détail `property`/`client` imbriqués = projections réduites (non consommés par le front). Prochaine
   tranche : legal (autonome) puis contract (dépend de transactions).
5. ~~**Repoint masquage**~~ ✅ **FAIT** — `dev-mesh-up.sh` pointe désormais
   `MODERATION_HIDDEN_URL` de listing/search vers **trust-safety**
   (`:8511/internal/moderation/hidden`, souverain) au lieu du monolithe — prérequis au
   décommissionnement. Vérifié : suspendre un vendeur via BFF→trust-safety masque son bien
   (listing 404), l'unsuspendre le rétablit (200). geo/crm **ne masquent pas** — c'est la
   **parité** : le `price_position` du monolithe (`market.py`) n'exclut pas non plus les comptes
   modérés ; masquer dans geo/crm divergerait. Rien à faire côté geo/crm.
6. **Décommissionnement final** : identity émet les jetons pour de bon (le monolithe arrête),
   pointer 100 % du proxy front → BFF, éteindre le monolithe.
   **Baseline propre faite** : `dev-mesh-up.sh` rejoué → 21 services 200, contrat **56/56**, tous les
   relais rechargés sur la lib outbox corrigée. **Reste ~100+ routes front-facing** (sur 289
   totales, la majorité déjà extraite). **Plan de tranches (ordonné, à exécuter une par une avec
   parité + E2E + commit, comme les 5 précédentes)** :
   - ✅ **T1 `buyer` FAIT** (`services/buyer` :8515) : `/buyer/saved-searches*` (CRUD),
     `/buyer/favorites*` (CRUD ; bien imbriqué = **dict COMPLET via listing** `internal/properties`, aucune projection locale),
     `/buyer/estimates*` (CRUD). Par utilisateur (`user_id` du JWT). `/buyer/messages*` = **déjà**
     servi par messaging. Nouveau service `services/buyer` (schéma dédié) + migration
     (`saved_searches`/`favorites`/`estimates`) + projection biens.
   - ✅ **T2 agency completion FAIT** (`/my-agency` membres via identity `internal/.../members` ; `/agencies/{slug}/properties` = **dicts COMPLETS via listing** `internal/properties`, masquage inclus — parité, au contrat)
   - ~~T2 agency completion~~ (2 routes) : `/my-agency` (include_members → membres = domaine identity ;
     appel interne identity ou projection) + `/agencies/{slug}/properties` (biens de l'agence →
     projection listing). Étend le service `agency` existant (:8512).
   - **T3 `dashboards`/`analytics`/`stats`** (~21 routes, **LA PLUS DURE** — agrégations cross-domaine).
     `backoffice/dashboard.py`(5) + `backoffice/stats.py`(6) + `backoffice/analytics.py`(10 :
     financial/market/pipeline/team/overview + `/dashboard/config` GET/PUT). ⚠ **le service
     `analytics` actuel est un stub** (`MetricCounter` + 1 route démo) : il faut **construire les
     read-models** (projections transactions/leads/clients/biens/visites/commissions) pour
     reproduire les agrégats (tendances CA, funnel de conversion, perf agents avec commissions,
     stats marché). Effort dédié conséquent — ne pas router le front vers un stub en cours de route
     (dashboards live cassés). `/dashboard/config` (JSON par utilisateur) ✅ **FAIT** (servi par identity — config sur le
     compte ; GET/PUT parité, propagation via user.updated). **Approche validée : agrégation query-time** (analytics lit les dumps internes des services
     propriétaires et agrège en mémoire, parité exacte). ✅ **financial/pipeline/ping/market/team/overview FAITS** (parité exacte). Reste : **stats/*** (6),
     **stats/* FAITS**. Reste : **dashboard** + **charts/*** (leads-by-source, properties-by-status,
     revenue-trend), **dashboard/activity** (audit dump). Dumps internes faits : transactions, crm
     (leads+charge_amount/clients/visits), listing (raw), geo refs, identity scope/seats/dashboard_config,
     billing subscription. Écart : export CSV non testé au contrat (ordre des lignes non déterministe).
   - ✅ **T4 `programs` FAIT** (`services/programs` :8516, 28 routes, contrat 84/84) — nouveau dev, (promotions immobilières neuves +
     `programs/{id}/plans`), pas encore consommé pareil — nouveau service.
   - ✅ **T5 `staymanager` FAIT** (`services/staymanager` :8517, 14 routes, contrat 88/88) — gate `has_staymanager_sync` (billing), API externe via `app/client.py` ; toutes données vides en dev (états non-connecté).
   - **Divers restants** : `selling.py`(4 : estimate/sale-requests/documents/uploads),
     `admin/shop`(writes produits/commandes) + `admin/artisans`(writes shared-artisans).
     `users.py`(3, profils publics) **mort côté front** (0 réf) → à droper à l'extinction, pas à
     migrer. ✅ **FAITS** : `admin/overview` (→ analytics), `admin/impersonation` (→ identity),
     **groupe leads/contact publics** (`leads.py` 7 routes) : contact/reveal-phone sur annonce déjà
     chez **listing** (`listing.contacted` → worker crm) ; `/contact` (demande de service),
     `/my-leads`(+summary), `/leads/{id}`(GET marque lu), `/leads/{id}/status`(PUT) → **crm**
     (ajout `owner_id` au lead crm pour cloisonner les biens de particuliers ; backfillé). Parité
     exacte (agence + particulier via impersonation), contrat **92/92**.
   **Coupure** : quand une tranche est verte au contrat, basculer son routage BFF (déjà le patron) ;
   quand **tout** est extrait → retirer le repli monolithe du BFF, éteindre `:7000`.

   ### État de la coupure finale (T1..T5 FAITS, contrat 88/88)
   **Fait** : front → BFF à **100 %** (`vite.config` `/api` → :8099) ; **deps internes v2→monolithe
   supprimées (3/3)** : (a) `users_client` de crm/transactions/contract → **identity**
   (`/internal/agency/{id}/members?active_only=1`, noms d'agents) ; (b) `listing` reveal-phone →
   **agency** (`/internal/agency/{id}/phone`) / **identity** (`/internal/user/{id}/phone`) ; (c)
   **modération de compte** (`trust-safety`) n'écrit **plus** dans le monolithe. **Plus aucun
   service v2 ne dépend du monolithe.**
   - ✅ **Domaine modération de compte extrait** (façade `trust-safety` → propriétaire de l'entité) :
     les 10 routes `/admin/accounts/{users|agencies}/{id}/{suspend|unsuspend|DELETE|restore|anonymize}`
     délèguent la mutation par **jeton interne** à **identity** (users : `UserRO`, gardes auto-action +
     dernier super-admin + déjà-fait, parité messages/`to_dict`, émet `user.updated`) et au service
     **agency** (agencies : modèle `Agency` complet, anonymisation PII, émet `agency.*`). `trust-safety`
     garde audit + **masquage** (§6, `ModerationStatus` pour les 5 actions) + événements `account.*`.
     identity **consomme `agency.*`** pour resynchroniser `agency_ro.is_suspended/is_deleted` (cohérence
     du blocage login `_login_blocked`). Outbox+relais ajoutés à agency. E2E validé (lifecycle complet
     users+agencies : suspend/unsuspend/delete/restore/anonymize, gardes 409/404, masquage, blocage
     login, resync AgencyRO), contrat **87/87** (trust-safety : agent1→403 des deux côtés). Le monolithe
     `admin/moderation.py` n'est **plus atteint** (le BFF route `/admin/accounts/*` → trust-safety).
   - BFF repli features `/my-subscription` (legacy tokens seulement — billing le sert déjà, non bloquant).
   - **Routes front encore servies par le monolithe** (repli BFF) : `selling`(4), `leads` racine public(7),
     `users`(3, `GET /backoffice/users`), `admin/shop|artisans|overview|impersonation`,
     `/dashboard/activity` (fait via analytics), integrations autres. ~20 routes mineures à extraire.
   - **Statique** : `/uploads` (images) sert encore depuis le disque du monolithe (`vite.config`) → migrer
     vers stockage objet (MinIO/S3) avant extinction.
   - **Sync transitoire** : `consume_users.py`/`relay_outbox.py` (monolithe) deviennent inutiles une fois
     `:7000` éteint (plus personne ne lit `public.users`).
   **Ordre** : (1) ✅ contact-phone + trust-safety repointés, (2) extraire les ~20 routes mineures, (3) migrer
   `/uploads`, (4) retirer le repli monolithe du BFF (`upstream_url`) + le proxy `/uploads`, (5) éteindre `:7000`.

## 9. Pièges connus (IMPORTANT pour un contexte frais)
- **`git commit` doit être une commande Bash SEULE** (le hook `block-no-verify` faux-positive sur
  les commandes composées). `git add` peut être chaîné, pas `git commit`.
- **PAS d'attribution IA** dans les messages de commit (règle utilisateur). Conventional Commits.
- **`pkill -f "port 80xx"`** matche le shell lui-même → utiliser `fuser -k 80xx/tcp`.
- **Bash `UID` est en lecture seule** → nommer la variable autrement (`USR`).
- **`curl | python -c json.load(sys.stdin)`** échoue sur les retours-ligne bruts dans le JSON
  (descriptions de biens) → utiliser `urllib` en Python.
- Le hook **rtk** peut mangler `ls`/`grep` → utiliser `python3 -c "import os; os.listdir(...)"`.
- **Secret JWT réel** = `PURGED-DEV-SECRET` (dans `backend/.env`, gitignoré). Un jour
  présent dans l'historique local du commit `42a0a07` (dev only, non poussé) — à purger/roter avant push.
- **Frontend non commité** : le lot UI du début (MAD→Đh, modals, favoris…) + `vite.config.js` proxy
  restent dans l'arbre de travail (préoccupation distincte du backend v2, laissée volontairement).
- Mots de passe de rôles Postgres en clair dans les `schema.sql` = **convention dev** (tous les
  services), pas un secret prod (creds réelles via env). Ne pas diverger pièce par pièce.

## 10. Contrat / vérification
`tools/contract_test.py` compare monolithe vs BFF route par route (statut + JSON normalisé, champs
volatils ignorés). Groupes : catalog, directory, listing, search, crm, marketplace, geo, messaging,
trust-safety, rbac, dashboard-config, dashboard, analytics, stats, agency, audit, transactions, legal, contract, billing, payment, buyer, programs, staymanager. **88/88** actuellement (`updated_at` volatil : bumpé par l'incrément de vues au GET détail) (normalize : collections de dicts triées par contenu — ordre non garanti côté monolithe ; `views`/`views_count` volatils) (collections par `id` ordre-insensible : membres /my-agency + biens /agencies/{slug}/properties non ordonnés côté monolithe).
