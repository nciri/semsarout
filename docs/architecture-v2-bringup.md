# Runbook — Monter la stack v2 et vérifier la parité

But : **valider sur ta machine** ce qui a été extrait (services v2) **avant** d'activer quoi que
ce soit en prod. Tant que les `*_URL` du BFF sont vides, le monolithe sert 100 % du trafic
(rien ne casse). On active **un service à la fois**, on lance les **tests de contrat**, on confirme
la parité, puis on passe au suivant.

> Hypothèse de simplicité : monolithe **et** schémas des services dans **la même base** PostgreSQL
> (`public.*` + un schéma par service). Les migrations font `INSERT ... SELECT FROM public.*`.
> En prod multi-bases, remplacer par un dump/restore.

## 0. Prérequis
- PostgreSQL **natif** (ADR-0002) avec la base SemsarOut, un rôle admin.
- Docker (infra), Python 3.11+, le monolithe fonctionnel sur `:7000`.
- Un **jeton JWT** valide : `POST /api/v1/auth/login` sur le monolithe → `access_token`.

## 1. Infra (hors Postgres)
```bash
cp infra/.env.example infra/.env
make infra-up          # RabbitMQ:15672 · MinIO:9001 · OpenSearch:9200 · Prometheus:9090 · Grafana:3001 · OTLP:4318
```

## 2. Libs partagées
```bash
make libs-install      # semsar_common · auth · events · storage · search
```

## 3. Schémas + rôles + migration (par service à tester)
```bash
export ADMIN="postgresql://<admin>@localhost:5432/semsar"
# exemple pour catalog :
psql "$ADMIN" -f services/catalog/db/schema.sql
psql "$ADMIN" -f services/catalog/db/migrate_from_monolith.sql
# idem pour listing, crm, directory, marketplace, contract, legal, payment, billing, identity, notification, analytics
```

## 4. Monolithe (inchangé)
```bash
export SEMSAR_INTERNAL_TOKEN=change-me-internal   # requis par les endpoints /internal/*
# Laisser SEMSAR_OUTBOX_ENABLED VIDE (off) sauf pour tester l'événementiel.
(cd backend && python run.py)                     # :7000
```

## 5. Services (chacun dans son terminal ; ports indicatifs)
Chaque service lit `.env` (copié depuis `.env.example`) : `TRUST_GATEWAY_HEADERS=true`,
`INTERNAL_TOKEN`, `MONOLITH_URL`, `DATABASE_URL` (rôle du service), `OPENSEARCH_URL`, etc.

| Port | Service | Lancer |
|------|---------|--------|
| 8001 | identity | `uvicorn app.main:app --port 8001` (+ `python -m app.relay`) |
| 8002 | notification | `uvicorn … --port 8002` (+ `python -m app.worker`) |
| 8003 | search | `uvicorn … --port 8003` (+ `python -m app.worker`) |
| 8005 | contract | `… --port 8005` (+ relay) |
| 8006 | legal | `… --port 8006` |
| 8007 | payment | `… --port 8007` (+ relay) |
| 8008 | billing | `… --port 8008` (+ worker + relay) |
| 8009 | catalog | `… --port 8009` (+ relay) |
| 8010 | marketplace | `… --port 8010` (+ worker) |
| 8011 | directory | `… --port 8011` |
| 8012 | listing | `… --port 8012` (+ relay) |
| 8013 | crm | `… --port 8013` (+ worker) |

> Les **workers/relais** ne sont nécessaires que pour l'événementiel (search/analytics/marketplace/crm
> consomment ; identity/contract/payment/billing/listing publient). Pour la parité **lecture**, les
> données migrées suffisent.

## 6. BFF (activation ciblée)
```bash
cp gateway/.env.example gateway/.env
# Dans gateway/.env : décommenter UNIQUEMENT le(s) service(s) à vérifier, ex. :
#   CATALOG_URL=http://localhost:8009
# + INTERNAL_TOKEN=change-me-internal  (pour /auth/me et /my-subscription)
uvicorn app.main:app --app-dir gateway --port 8080
```

## 7. Tests de contrat (le cœur de la vérification)
```bash
pip install requests
python tools/contract_test.py --monolith http://localhost:7000 --bff http://localhost:8080 \
                              --token "$JWT" --services catalog
```
Le script rejoue chaque route **en lecture** deux fois — via le **monolithe** et via le **BFF**
(qui route vers le service) — et **compare** statut + JSON normalisé (champs volatils ignorés).
`PASS` = parité ; `DIFF` = à investiguer (typiquement les 5 filtres OpenSearch approximés, ou un
shape à ajuster).

## 8. Ordre recommandé (un service à la fois)
1. **catalog** puis **directory** (self-contained, faible risque).
2. **listing** (détail/CRUD) puis **search** (découverte — attention aux 5 filtres approximés).
3. **crm** (leads/clients/visites).
4. **marketplace** (dépend de catalog : lancer catalog + son reserve).
5. contract / legal / payment / billing.

Quand un service passe au vert : garder son `*_URL` actif, activer le suivant, relancer les tests.
Une fois **tout** au vert, pointer le proxy Vite du front vers `:8080` (BFF) au lieu de `:7000`
pour une vérif UI manuelle, puis planifier le **décommissionnement** du domaine côté monolithe.

## 9. Écarts connus à surveiller (documentés dans les README des services)
- **search** : 5 filtres (substring `city/neighborhood/q`, `features`, `last_floor`, géo) = équivalents OpenSearch.
- **marketplace** : adresse depuis `property_id` (→ listing) ; **directory** : validation `property_id` (→ listing).
- **crm** : `ActivityLog` (audit) non répliqué ; `visits_count`/`transactions_count` = 0 tant que le Stage D (transactions) n'est pas fait.
