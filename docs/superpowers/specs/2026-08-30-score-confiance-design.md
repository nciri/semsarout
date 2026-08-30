# Spec — Score de confiance réel (remplace `is_verified` tautologique)

**Date :** 2026-08-30 · **Branche :** `feature/trust-score` (depuis `develop`)

## Objectif

Remplacer le badge « Vérifié » actuel (`is_verified`, booléen déclaratif jamais
vérifié) par un vrai palier de confiance calculé à partir de signaux existants :
KYC, transactions conclues, signalements de fraude confirmés, suspensions.
Livrable 1 d'un chantier plus large « sortir du lot vs Avito/Mubawab/Sarouty »
(brainstorming du 2026-08-30) — la suite (parcours transactionnel bout-en-bout
vérifié) sera spec-ée séparément une fois ce livrable en prod.

## Paliers (décidés en brainstorming)

- 🔴 **Non vérifié** — pas de KYC validé.
- 🟡 **Identité vérifiée** — KYC `verified` pour l'entité (ou son propriétaire,
  cf. résolution agence ci-dessous). *(Hors périmètre : validation licence/RC/ICE
  — itération 2.)*
- 🟢 **Vérifié + expérience** — 🟡 **et** au moins 1 transaction conclue sur la
  plateforme (compteur affiché : « N transactions conclues via semsarout »).
- ⚫ **Suspendu** — `ModerationStatus.is_suspended`/`is_deleted` vrai, ou
  signalement `reason=fraud` résolu confirmé → badge masqué immédiatement, sans
  lissage/moyenne. Prioritaire sur tout autre palier.

Binaire par critère (pas de score pondéré 0-100) : évite l'effet « gaming » et
reste explicable à l'utilisateur.

## Modèle de données (schéma `trust_safety`, service existant)

Nouvelle table `trust_level` :

- `entity_type` (`user` | `agency`, cohérent avec `ModerationStatus` existant)
- `entity_id` (BigInteger)
- `level` (`none` | `verified` | `verified_experience`), défaut `none`
- `deal_count` (Integer, défaut 0) — nombre de transactions conclues comptées
- `updated_at`
- PK composite (`entity_type`, `entity_id`)

Table `ProcessedMessage` (idempotence du nouveau worker, calquée sur le patron
`coloc-profile/app/worker.py`).

## Résolution agence ↔ KYC

Le KYC est porté par un `user_id` (`identity.kyc_verification`), mais une agence
n'a pas de KYC propre — seulement `Agency.owner_id`. À la réception de
`identity.kyc.verified` pour `user_id=X` :
1. Upsert `trust_level(user, X)` → au moins `verified`.
2. Si `X` est `owner_id` d'une ou plusieurs agences (lookup via le service
   `agency`, endpoint interne `GET /internal/agencies?owner_id=X` à créer),
   upsert `trust_level(agency, agency_id)` → au moins `verified` pour chacune.

## Flux événementiel (nouveau `services/trust-safety/app/worker.py`)

Consumer RabbitMQ (patron `EventConsumer`, bindings multiples), idempotent par
`message_id` :

- `identity.kyc.verified` → résolution ci-dessus, palier → `verified` (ne
  redescend jamais un `verified_experience` existant).
- `identity.kyc.rejected` → si l'entité était `none`, ne change rien (elle l'est
  déjà) ; ne fait **pas** redescendre une entité déjà `verified_experience` par
  un rejet portant sur une KYC différente/ultérieure (cas rare, documenté, pas
  géré en v1 — pas de downgrade automatique sur rejet, seulement sur fraude
  confirmée ou suspension).
- `commission.settled`, `sale.compromis.signed`, `rental.lease.signed` →
  extraire `agency_id` du payload (présent sur les trois événements ; fallback
  `account_id`/`owner_id` pour les baux particuliers → `entity_type=user`) ;
  incrémente `deal_count` ; si l'entité est déjà `verified` (ou le devient dans
  le même traitement), palier → `verified_experience`. Si l'entité est encore
  `none` (aucun KYC), le compteur s'incrémente quand même mais le palier reste
  `none` — l'expérience seule ne suffit pas à afficher un badge.

Suspension et fraude ne passent **pas** par le worker (déjà gérées en local par
`trust-safety`) :
- `POST /admin/accounts/{type}/{id}/suspend` → force `trust_level.level = none`
  en plus du `ModerationStatus` existant (même transaction).
- `POST /admin/reports/{id}/resolve` avec `reason=fraud` → si `target_type`
  vaut `profile` ou `agency`, résout `entity_type`/`entity_id` depuis
  `target_type`/`target_id` du signalement et force `trust_level.level = none`.
  *(Extension nécessaire : `Report.target_type` doit accepter `agency` en plus
  de `listing|profile|message` ; `Report` doit aussi perdre son défaut de
  tenant `m3a-l3achrane` pour les signalements côté semsarout — cf. plomberie.)*

## Endpoint de lecture

`GET /trust/{entity_type}/{entity_id}` (public, pas d'auth) → `{level,
deal_count}`. Le BFF expose `/api/v1/trust/*` en proxy direct (pas
d'agrégation nécessaire).

## Frontend

**m3a-l3achrane** (`frontend-m3a-l3achrane/`) : le composant
`src/ds/trust/VerifiedBadge.jsx` a déjà un prop `level` (`full|partial|none`) —
mapping direct `verified_experience→full`, `verified→partial`, `none`→ne pas
afficher. Remplacer les usages actuels codés en dur (`ListingDetail.jsx`,
`ListingCard.jsx`, `BackOffice.jsx`, `Securite.jsx`) par un appel réel à
`GET /trust/user/{id}` (profil individuel m3a).

**semsarout** (`frontend/`) : `agency.is_verified` (booléen) actuellement
affiché dans `AgencyDetail.jsx`, `AgencyList.jsx`, `AgencyMap.jsx`. Nouveau
petit composant `frontend/src/components/common/TrustBadge.jsx` (calqué sur
`PriceGauge.jsx` pour le style), 3 états visuels correspondant aux paliers.
Le service `agency` doit exposer `trust_level`/`deal_count` dans son payload
(`GET /agencies`, `GET /agencies/{id}`) — via appel interne à `trust-safety`
au moment de la sérialisation (pattern déjà utilisé ailleurs pour composer des
données cross-service côté BFF ou service). `is_verified` (colonne) est
**conservé tel quel** dans le modèle `Agency` (compat annonces existantes) mais
n'est plus utilisé par le front une fois ce livrable posé — pas de migration
de suppression dans ce livrable.

i18n FR + AR pour tous les nouveaux libellés (parité obligatoire, cf. tests
`noHardcodedText`).

## Plomberie

- `services/trust-safety/db/schema.sql` : ajoute `trust_level` (migration
  incrémentale si le schéma existe déjà en local/prod, cf. patron
  `services/listing/db/migrate_condo.sql`).
- `services/trust-safety/app/worker.py` : nouveau, bindings
  `["identity.kyc.#", "commission.settled", "sale.compromis.signed",
  "rental.lease.signed"]`.
- `services/agency/app/main.py` : nouvel endpoint interne
  `GET /internal/agencies?owner_id=` (garde `x-internal-token`, patron
  `partner`/`internal/stats`).
- `scripts/dev-mesh-up.sh` : ajouter la boucle worker `trust-safety`.
- Gateway : route `/api/v1/trust*` → service `trust-safety` (patron existant
  `_resolve_upstream`).
- CI : `trust-safety` a déjà ses jobs pytest ; pas de nouvelle entrée matrice.

## Tests

- **Backend** : upsert idempotent par `message_id` ; résolution agence↔owner
  (KYC d'un owner de 2 agences propage aux deux) ; downgrade immédiat sur
  suspension et sur fraude confirmée (pas sur simple rejet KYC) ; compteur
  `deal_count` incrémenté sans faire monter de palier si `none` ; endpoint de
  lecture 404 propre si entité jamais vue (retourne `level=none` par défaut,
  pas 404 — un compte jamais KYC-é doit afficher 🔴, pas une erreur).
- **Front** : mapping palier→visuel sur les deux frontends ; parité i18n
  FR/AR ; badge absent (pas juste vide) quand `level=none` côté m3a
  (cohérent avec le comportement actuel de masquage total du badge).

## Hors périmètre (itération 2)

- Validation réelle des numéros licence/RC/ICE (registre officiel ou
  validation manuelle admin).
- Score par annonce individuelle (au-delà du badge agent/agence hérité).
- Pondération/downgrade progressif sur rejet KYC répété.
- Piste stratégique #1 du brainstorming (parcours transactionnel bout-en-bout
  vérifié — KYC réel Didit, e-signature réelle partout, séquestre CMI complet).
