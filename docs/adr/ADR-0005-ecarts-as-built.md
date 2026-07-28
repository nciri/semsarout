# ADR-0005 — Écarts as-built vs architecture cible v2

- **Statut :** accepté
- **Date :** 2026-07-28
- **Contexte :** la migration strangler est terminée (monolithe Flask décommissionné, le mesh
  FastAPI sert 100 % du front). Cet ADR consigne les **écarts assumés** entre l'implémentation
  réalisée et la cible décrite dans `docs/architecture-v2.md` / `ADR-0001`, pour que les
  documents de conception reflètent honnêtement l'état réel.

## Décision

Acter les écarts suivants comme **choix as-built** (et non comme dette accidentelle), avec leur
justification et, le cas échéant, leur trajectoire de convergence.

### 1. JWT **HS256** (secret symétrique partagé) au lieu de **RS256** (asymétrique) — *écart majeur*

- **Cible (ADR-0001 §6, doc §3/§6) :** JWT RS256, chaque service vérifie via la clé publique.
- **Réalisé :** `identity` émet en **HS256** (`JWT_ALGO="HS256"`), le BFF valide **localement**
  avec le **même secret** (`JWT_SECRET_KEY` partagé). Résolution d'identité 100 % locale à partir
  des claims ; plus aucun appel au monolithe.
- **Pourquoi :** interopérabilité avec `flask-jwt-extended` pendant le strangler — identity devait
  émettre des jetons que l'ancien stack pouvait aussi valider (même secret, même structure), pour
  que jetons anciens et nouveaux coexistent sans reconnexion forcée.
- **Conséquence / trajectoire :** un secret partagé traverse tous les services (vs vérification par
  clé publique par service). **Durcissement futur** : bascule RS256 (identity garde la clé privée,
  les services/BFF ne connaissent que la publique) une fois le monolithe hors du tableau — ce qui
  est désormais le cas. À planifier comme évolution isolée (rotation de clés + JWKS).

### 2. **22 services** au lieu des **19** cibles (trois domaines détachés)

- **transactions** détaché de `crm` (pipeline ventes/locations + documents).
- **programs** détaché de `listing` (programmes neufs : units/plans/lots).
- **audit** détaché de `trust-safety` (journal d'activité, consomme `audit.logged`).
- **Pourquoi :** frontières transactionnelles et de charge distinctes ; plus fidèle au principe
  « un domaine = un service ». Écart **par excès de granularité**, pas de regroupement.
- **Nommage :** `integrations/ingestion` de la cible est réalisé sous le nom **staymanager**.

### 3. Format d'erreur **legacy `{"error": msg}`** dominant, pas **RFC 9457** uniforme

- **Cible :** `application/problem+json` (RFC 9457) partout.
- **Réalisé :** 19 services renvoient le format legacy `{'error': msg}`
  (`install_legacy_error_handlers`) ; seules les **surfaces neuves** (ex. KYC) utilisent RFC 9457.
- **Pourquoi :** contrainte « frontend intact » — le SPA attend la forme d'erreur Flask historique ;
  reproduire RFC 9457 aurait cassé la parité de contrat testée par `tools/contract_test.py`.

### 4. Analytics + lectures admin = **agrégation query-time**, pas projection événementielle

- **Cible (doc §5) :** analytics = « projection reconstructible » maintenue par événements.
- **Réalisé :** `analytics` lit à la demande les **dumps internes** des services propriétaires
  (transactions, crm, identity, agency, billing, listing, audit) et **agrège en mémoire** —
  pas de duplication de données. Idem pour `admin/overview` et `admin/accounts`.
- **Compromis :** pas de dérive / pas de re-projection à maintenir, au prix d'une latence de lecture
  et d'un couplage à la disponibilité des services propriétaires. (La recherche `search` reste, elle,
  une vraie projection OpenSearch reconstructible, conforme à la cible.)

### 5. Pas de **Traefik**

- **Cible (doc §2/§3) :** Traefik v3 en entrée unique devant le BFF.
- **Réalisé :** le **BFF est l'entrée**. En dev, le front (vite) proxifie `/api` et `/uploads`
  directement vers le BFF (`:8099`). Traefik reste un choix de **déploiement**, hors périmètre du
  code applicatif.

### 6. Raffinements de propriété décidés pendant la coupure (non spécifiés dans la cible)

- **Modération de compte :** `trust-safety` est une **façade** qui délègue l'écriture au service
  propriétaire (users→`identity`, agencies→`agency`) et conserve audit + masquage + événements.
- **Lectures comptes/overview super-admin → `analytics`** (l'agrégateur cross-domaine).
- **`/backoffice/settings` → `agency`** : endpoint **neuf**, absent du monolithe **et** de la cible.
- **Médias → `listing` + MinIO** (`semsar_storage`) ; le BFF sert `/uploads/*` → listing.

## Points cible **câblés mais stub/partiels** (jalon migration, pas cible prod finale)

- **KYC/CIN** : modèle + endpoint, sans provider Didit réel.
- **E-signature** : structure, sans provider réel.
- **Séquestre CMI** : webhook paiement + anti-rejeu, pas l'escrow CMI complet.
- **Observabilité** : instrumentation OTel + `/metrics` Prometheus présentes, mais le collecteur
  OTLP / Grafana / Loki ne tournent pas en dev (l'export de traces échoue proprement).

## Conséquences

- **+** Les documents de conception (`architecture-v2.md`, `.drawio`) reflètent désormais l'état réel.
- **+** Les écarts sont tracés avec leur justification → décisions futures informées.
- **−** Écart de sécurité HS256 à résorber (RS256/JWKS) — seul écart « à corriger » ; les autres
  sont des choix pragmatiques assumés.
