# Branchement du frontend M3a-L3achrane sur le backend SemsarOut — Design

**Date :** 2026-08-01
**Statut :** validé en brainstorming, en attente de plan d'implémentation
**Précède :** `docs/superpowers/plans/` (plan à venir via writing-plans)
**Référence produit :** dépôt initial `/home/younes/Documents/work/m3a-l3achrane` (`PROMPT_INIT.md`, `CLAUDE.md`, `docs/adr/`)

---

## 1. Contexte et objectif

Le frontend M3a-L3achrane (`frontend-m3a-l3chrane/`, à renommer — voir §9) est une SPA
Vite/React à trois surfaces (web publique, espace chercheur, portail partenaire) dont
toutes les données sont mockées derrière une façade (`src/services/index.js`,
flag `VITE_USE_MOCK`). Le backend SemsarOut (mesh v2 : ~25 services FastAPI derrière le
BFF `gateway/` :8099) ne connaît que l'immobilier classique — **aucun concept de
colocation n'y existe**.

Le dépôt initial m3a-l3achrane contient un backend colocation réel (~13 700 LOC source,
~5 500 LOC de tests, 16 services, zéro placeholder, ~70 % du périmètre v1 fonctionnel).

**Objectif :** brancher le frontend sur le backend 0semsar en portant le **domaine
colocation complet** depuis le dépôt initial, avec 0semsar comme **source unique**
(le dépôt initial devient une référence archivée, plus maintenue).

## 2. Décisions de cadrage (validées)

| Décision | Choix |
|---|---|
| Périmètre | **Port complet du domaine coloc** : annonces, profils/lifestyle, matching, partenaires, candidatures/visites/séjours, séquestre caution, signalements/évaluations |
| Comptes | **Séparés par tenant** dans le service `identity` semsarout : un compte SemsarOut ne se connecte pas sur M3a-L3achrane, et inversement |
| Dépôt source | **0semsar source unique** ; code porté et adapté aux conventions `semsar_*` |
| Intégration | **Domaine coloc isolé** : base de données propre (schémas + rôles PG dédiés dans le cluster natif existant), communication avec SemsarOut uniquement par APIs (via BFF) et topics RabbitMQ |
| Granularité | **Services m3a-l3achrane portés séparément** (7 services), fidèles au découpage du dépôt initial |
| Nommage | **`m3a-l3achrane` en entier, partout** (tenant, en-têtes, dossiers, prose) — jamais « m3a » seul ; l'orthographe « l3chrane » est une faute à corriger |

Alternatives écartées :
- *Étendre les services semsarout existants* (tables satellites `coloc_*` dans leurs
  schémas) : dilue le domaine coloc dans l'hôte, couplage durable, code testé du dépôt
  initial réécrit au lieu d'être porté.
- *Mesh m3a-l3achrane autonome fédéré par Host* : deux écosystèmes de libs et deux
  systèmes d'auth à maintenir, contredit la décision d'identité par tenant.

## 3. Architecture

```
frontend-m3a-l3achrane (:5610) ──/api/v1 (proxy Vite)──▶ gateway/BFF (:8099)
        │
        ├── PARTAGÉ (services semsarout, extensions minimes)
        │     identity      → auth + tenant "m3a-l3achrane"
        │     messaging     → threads (réutilisé tel quel)
        │     search        → index OpenSearch coloc_listings + consommateurs coloc.*
        │     notification, uploads/MinIO, RabbitMQ, observabilité
        │
        └── DOMAINE COLOC (portés du dépôt initial, schémas PG dédiés)
              coloc-listing   → annonces, médias, règles de vie, colocataires
              coloc-profile   → profils, lifestyle, favoris, blocages
              matching        → scores de compatibilité (paresseux + cache)
              partnership     → partenaires, quotas, affiliés, k-anonymat
              coloc-booking   → candidatures, visites, séjours
              coloc-payment   → séquestre caution, déclarations espèces, frais
              coloc-trust     → signalements, modération, évaluations
```

Règles structurantes (héritées des deux projets) :
- PostgreSQL natif (jamais conteneurisé), **un schéma + un rôle SQL par service**,
  aucune lecture cross-schéma.
- PostgreSQL est la source de vérité ; OpenSearch, caches de scores et notifications
  sont des projections reconstructibles.
- Aucun appel synchrone entre services coloc : outbox transactionnel + consommateurs
  idempotents (topics RabbitMQ), composition au BFF uniquement.
- Le service `identity` OTP du dépôt initial n'est **pas** porté : l'auth est celle de
  SemsarOut (JWT email/password), le client API du front en est déjà un miroir.

## 4. Modèle de données

### 4.1 Services coloc portés (schémas et tests hérités du dépôt initial)

| Service | Schéma PG | Tables |
|---|---|---|
| `coloc-listing` | `coloc_listing` | `properties`, `listings`, `listing_media`, `house_rules`, `current_roommates` |
| `coloc-profile` | `coloc_profile` | `profiles`, `lifestyle_answers`, `profile_interests`, `saved_searches`, `favorites`, `blocks` |
| `matching` | `matching` | `matching_weights`, `compatibility_profiles`, `listing_criteria`, `match_scores` |
| `partnership` | `partnership` | `partners`, `agreements`, `partner_api_keys`, `affiliate_roster`, `affiliation_claims`, `reserved_inventory`, `partner_access_log` |
| `coloc-booking` | `coloc_booking` | `applications`, `viewings`, `stays` |
| `coloc-payment` | `coloc_payment` | `escrows`, `cash_declarations`, `service_fees` |
| `coloc-trust` | `coloc_trust` | `reports`, `moderation_queue`, `sanctions`, `reviews`, `image_hashes` |

Ajustements par rapport au code initial :
- **Matching paresseux** : le score déterministe (contraintes dures genre/budget/ville +
  pondération lifestyle + explications, `domain/scoring.py` du dépôt initial) est
  calculé à la première lecture puis mis en cache dans `match_scores` ; les événements
  `coloc.profile_updated` / `coloc.listing_published` **invalident** les entrées
  concernées au lieu de tout recalculer (pas d'explosion N×M).
- Les FK `user_id` référencent les ids numériques (`BigInteger`) de l'identity
  semsarout (`user_ro.id`), transmis par les en-têtes `x-semsar-*` injectés par le
  BFF — les UUID v7 du dépôt initial sont convertis lors du port.
- `coloc-trust` porte le service le mieux testé du dépôt initial ; le `trust-safety`
  semsarout conserve uniquement les actions plateforme (suspension de comptes).

### 4.2 Extensions des services partagés

- `identity` : colonne `users.tenant` (`'semsar'` défaut | `'m3a-l3achrane'`),
  unicité **(tenant, email)** — même email possible sur les deux produits, comptes
  distincts. Claim `tenant` dans le JWT + en-tête `x-semsar-tenant` vers les services.
- `search` : index OpenSearch `coloc_listings`, alimenté par les événements
  `coloc.listing_*` (projection reconstructible).
- `messaging` : conversations scopées par tenant ; exposition du format threads (§5).

### 4.3 Événements (outbox `semsar_events`)

`coloc.listing_published`, `coloc.listing_status_changed`, `coloc.profile_updated`,
`coloc.application_created`, `coloc.application_status_changed`,
`coloc.escrow_funded`, `coloc.escrow_released`, `coloc.escrow_refunded`,
`coloc.report_created`. Schémas versionnés comme les événements existants.

## 5. Contrat API

Toutes les routes sous `/api/v1`, ajoutées à la table strangler du BFF
(`gateway/app/main.py`, `_resolve_upstream`).

| Route | Cible | Note |
|---|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/refresh`… | `identity` | existant ; le tenant `m3a-l3achrane` est attaché au compte à l'inscription |
| `GET /listings` (filtres ville, budget, type, genre, chips lifestyle, tri) | `search` | liste depuis la projection OpenSearch |
| `GET /listings/{id}` | `coloc-listing` | détail complet (médias, règles, colocataires) |
| `POST /listings`, `PUT /listings/{id}`, `POST /listings/{id}/publish` | `coloc-listing` | cycle de vie + modération |
| `GET/PUT /me/profile`, `PUT /me/lifestyle` | `coloc-profile` | |
| `GET /me/favorites`, `POST/DELETE /me/favorites/{listingId}` | `coloc-profile` | |
| `GET /partners` | `partnership` | référentiel + quotas (portail partenaire) |
| `GET /messages/threads`, `POST /messages/threads/{id}` | `messaging` | l'envoi de message (aujourd'hui local au front) est branché |
| `POST /applications`, `GET /me/applications`, `PUT /applications/{id}/status` | `coloc-booking` | idempotent (clé d'idempotence) |
| `POST /applications/{id}/viewings`, `GET /me/viewings` | `coloc-booking` | |
| `GET /me/stays` | `coloc-booking` | |
| `POST /escrows`, `POST /escrows/{id}/release`, `POST /escrows/{id}/refund`, `POST /cash-declarations` | `coloc-payment` | idempotent |
| `POST /reports`, `GET /me/reviews`, `POST /stays/{id}/reviews` | `coloc-trust` | |

**Agrégation BFF (unique endpoint composite)** : `GET /listings` — le BFF interroge
`search`, puis récupère en batch les scores `matching` pour l'utilisateur courant et
compose `[{listing…, match_pct}]`. Anonyme → champ absent. `matching` indisponible →
réponse **sans** score, jamais d'échec de la recherche.

**Clés françaises — mapping côté front.** Le backend reste en anglais (`title`,
`city`, `price_mad`, `is_verified`…), cohérent avec SemsarOut et le code porté. La
traduction vers les clés attendues par les composants (`titre`, `ville`, `prixMad`,
`verifiee`…) vit dans un module pur `src/services/mappers.js` appelé par la façade
`src/services/index.js` (le seam mock/live existant), testé avec `node --test`.

**Pagination** : curseur. **Erreurs** : format d'erreur semsarout conservé tel quel.

## 6. Résolution du tenant

- **Prod** : Traefik route par `Host` (domaine m3a-l3achrane) ; le BFF déduit le tenant
  d'une table de correspondance Host→tenant.
- **Dev** : le proxy Vite du front injecte `x-tenant: m3a-l3achrane` ; le BFF filtre
  cet en-tête venant de l'extérieur (même logique que le filtrage `x-semsar-*`).
- **Authentifié** : le claim `tenant` du JWT fait foi. Le BFF rejette un token
  `semsar` sur une route m3a-l3achrane et inversement. Les services coloc vérifient le
  tenant reçu en en-tête (défense en profondeur).

## 7. Flux de données clés

1. **Inscription & profil** : `POST /auth/register` (tenant attaché) →
   `identity.user_registered` → `coloc-profile` crée le profil vide. `PUT /me/lifestyle`
   → `coloc.profile_updated` → `matching` invalide les scores de l'utilisateur.
2. **Publication → indexation → matching** : `POST /listings/{id}/publish` →
   `coloc.listing_published` → `search` indexe, `matching` invalide.
3. **Recherche & détail** (parcours principal) : `GET /listings` → `search` (+ scores
   batch si authentifié) → mappers EN→FR → composants. `GET /listings/{id}` →
   `coloc-listing` ; médias servis par MinIO via `/uploads`.
4. **Candidature → visite → séjour → caution** : candidature (`envoyee` → notification
   au publicateur) → acceptation (notification au chercheur) → visite → création du
   `stay` (`pending`) → `POST /escrows` (fund) → `coloc.escrow_funded` → stay `actif`
   → fin de séjour → release/refund → `coloc.escrow_released` → `coloc-trust` ouvre la
   fenêtre d'évaluations croisées. Chaque étape idempotente ; un échec de notification
   ne bloque jamais la transaction source.
5. **Messagerie** : threads via `messaging` partagé ; pas de WebSocket au MVP
   (rafraîchissement à la lecture) — temps réel en itération ultérieure.
6. **Portail partenaire** : `GET /partners` (quotas, statuts) ; reporting k-anonymisé
   (k≥5), jamais de données individuelles. Surfaces API partenaires HMAC portées mais
   non exposées au BFF public (itération ultérieure).

## 8. Erreurs, sécurité, conventions, tests

### Erreurs
- Format semsarout sur toutes les routes ; état « erreur de chargement » réutilisable
  ajouté aux écrans du front (le 404 existe déjà).
- 401 : refresh unique puis purge + retour connexion (déjà implémenté dans
  `src/services/api.js`).
- Idempotence : consommateurs d'événements idempotents ; `POST /applications` et
  `POST /escrows` protégés par clé d'idempotence.
- Dégradation : la recherche fonctionne sans `matching` (score omis, anneau masqué).

### Sécurité
- Filtrage des en-têtes `x-tenant` / `x-semsar-*` entrants au BFF ; rejet cross-tenant.
- Autorisations : candidature visible uniquement par ses deux parties ; escrow
  manipulable uniquement par ses parties + admin ; reporting partenaire k≥5.
- Pas de PII dans les logs ; montants en `Decimal` MAD (jamais de float) ; aucun
  secret dans le dépôt.

### Conventions de portage
- Libs `semsar_*` (auth, events/outbox, storage, common) en remplacement des `m3a_*`.
- `db/schema.sql` par service (conversion des migrations Alembic du dépôt initial),
  comme les ~25 services existants.
- Enregistrement dans `scripts/dev-mesh-up.sh`, le Makefile et l'observabilité de la
  plateforme (logs structurés, métriques).

### Tests
1. **Suites pytest portées** avec chaque service (~5 500 LOC du dépôt initial :
   scoring, escrow, modération, candidatures…), adaptées aux libs `semsar_*`.
2. **Contrat** : `tools/contract_test.py` étendu (nouvelles routes + refus
   cross-tenant) ; routes semsarout existantes **byte-identiques** (anti-régression).
3. **Front** : tests `node --test` des mappers (listing, profile, partner, thread),
   ESLint `--max-warnings 0`, build prod.
4. **Seed & E2E** : script de seed coloc (comptes tenant, annonces, profils,
   partenaires) + smoke `VITE_USE_MOCK=false` contre le mesh : recherche → détail →
   candidature → messagerie, et portail partenaire.
5. **Gate final** : lint + typecheck + tests + build (backend `ruff`/`mypy`, front
   ESLint/build) avant tout « terminé ».

## 9. Renommage du dossier front

`frontend-m3a-l3chrane/` → `frontend-m3a-l3achrane/` (correction de l'orthographe),
avec mise à jour des références (Makefile, scripts, docs, spec/plan du 2026-07-31).

## 10. Hors périmètre (itérations ultérieures explicites)

- Câblage UI des flux transactionnels : le backend candidatures/visites/séjours/escrow/
  signalements est livré testé via API ; les écrans front correspondants (au-delà des
  6 endpoints déjà câblés) arrivent par petites itérations après le branchement.
- Messagerie temps réel (WebSocket), pièces jointes, appels/visio.
- Exposition publique des surfaces API partenaires (HMAC) et ingestion de flux.
- Embeddings/pgvector pour le matching (étage 3 du cadrage initial — absent aussi du
  dépôt initial).
- Contrats signés (3a9dSign) et intégration CMI réelle (les stubs du dépôt initial ne
  sont pas portés au MVP ; le séquestre fonctionne en flux déclaratif).
- i18n arabe/RTL du front (mono-langue FR aujourd'hui).
- Subventions, facturation partenaire, états des lieux (`inventories`) — absents aussi
  du dépôt initial.

## 11. Critères de succès

1. Le front tourne avec `VITE_USE_MOCK=false` contre le mesh : les trois surfaces
   affichent des données réelles seedées (recherche filtrée, détail, profil,
   partenaires, threads).
2. Un compte créé côté m3a-l3achrane ne peut pas se connecter côté SemsarOut (et
   inversement) — vérifié par test de contrat.
3. Les suites pytest portées passent ; `tools/contract_test.py` passe intégralement,
   y compris les routes semsarout historiques inchangées.
4. Le parcours candidature → séjour → escrow → évaluation fonctionne de bout en bout
   via API (scénario de test automatisé).
5. `make check` (ou gate équivalent lint+typecheck+tests+build) vert.
