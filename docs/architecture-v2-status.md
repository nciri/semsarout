# Migration v2 — État & reprise (handoff)

> **But de ce document** : permettre de reprendre le chantier v2 avec un contexte vierge.
> Décrit ce qui est fait, ce qui tourne, comment tout relancer, et le reste à faire.
> Branche : `feature/architecture-v2` (commits **locaux uniquement**, aucun upstream, aucun push).

Dernière mise à jour de session : contrat **41/41 PASS** (transactions ajouté, +8 cas).

> **REPRISE (contexte frais)** — §8 items #1, #2, #5 **FAITS** ; **#4 `transactions` FAIT** (1ʳᵉ
> tranche de #4, vérifié E2E, contrat 41/41). Service `services/transactions` (:8514, schéma/rôle
> dédiés) reroute `/backoffice/transactions*` à l'identique (liste/pipeline/stats/stages/CRUD/move/
> offers/documents), émet `transaction.*` (outbox→crm maintient `transaction_ro`).
> **Fix mesh au passage** : `message_id` d'outbox namespacé par `aggregate_type`
> (`libs/semsar_events/…/outbox.py`) — sans ça, un consumer multi-publisher (crm = listing.* +
> transaction.*) collisionnait sur les id d'outbox locaux (relais existants rechargent la lib au
> prochain `dev-mesh-up.sh`).
> Prochaine tranche : **legal** (autonome, gating via `Principal.features`), puis **contract**
> (dépend de transactions, désormais dispo). Ordre restant : `legal → billing → contract → payment → #6`.
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
| listing | 8012 | biens : détail/CRUD/publish/my-properties + engagement (contact/reveal-phone) |
| crm | 8013 | leads/clients/visites (`/backoffice/leads|clients|visits`) |
| search | 8103 | découverte biens (`GET /properties`, `/properties/search`, `/suggestions`) — OpenSearch |
| geo | 8509 | positionnement prix + `/market/neighborhood-prices` |
| messaging | 8510 | messages acheteur (`/buyer/messages`) |
| trust-safety | 8511 | modération comptes (`/admin/accounts/*/suspend|unsuspend`) + masquage souverain |
| agency | 8512 | agences lecture (`GET /agencies`, `/agencies/{slug}`) |
| audit | 8513 | journal transverse (`GET /admin/activity`) |
| transactions | 8514 | pipeline ventes/locations (`/backoffice/transactions*` : liste/pipeline/stats/stages/CRUD/move/offers/documents) |
| identity | 8501 | **auth complète** (voir §3) + RBAC + teams/invitations |

**Services additifs (nouvelles surfaces, PAS consommées par le front — voir reste à faire) :**
identity(KYC) · notification 8502 · analytics 8504 · contract 8505 · legal 8506 · payment 8507 · billing 8508

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
  notification, identity, audit, transactions + monolithe (`consume_users.py`).
- **Idempotence multi-publisher** : `message_id` d'outbox namespacé par `aggregate_type` (les id
  d'outbox sont locaux à chaque publisher ; crm consomme désormais listing.* **et** transaction.*).

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
  --token "$TOK" --services catalog,directory,listing,search,crm,marketplace,geo,messaging,trust-safety,rbac,agency,audit,transactions --property-id 90
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
   (`Transaction`+`TransactionDocument`). Donc : **legal (autonome) → billing → transactions(#4) →
   contract → payment**. Chaque tranche = migration de projection (`migrate_from_monolith.sql`) +
   port fidèle des routes (scopé agence, erreurs `{'error'}`) + routage BFF + ajout au contrat.
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
trust-safety, rbac, agency, audit, transactions. **41/41** actuellement.
