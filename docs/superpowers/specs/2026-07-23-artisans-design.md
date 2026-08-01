# Spec — Référentiel artisans & interventions (Pro / Entreprise)

**Date :** 2026-07-23
**Brique :** 6 / 8 de la refonte
**Statut :** validé, prêt pour le plan d'implémentation
**Dépend de :** brique 1 (super-admin `/admin`, `require_superadmin`), brique 2 (plans), brique 5 (pattern annuaire).

---

## 1. Contexte & problème

Aucun modèle artisan/prestataire n'existe. La brique 6 ajoute un **référentiel d'artisans** par
métier (plombiers, électriciens, ménage, menuisiers, peintres, architectes d'intérieur…) avec un
**socle partagé** (catalogue plateforme géré par le super-admin) **et** des artisans **privés** par
agence, plus des **bons de travaux** (interventions) pour assigner un artisan à un bien et suivre le
travail. Réservé aux plans **Pro/Entreprise**.

## 2. Décisions validées
| Sujet | Décision |
|-------|----------|
| Portée | **Partagé (plateforme) + privé (agence)** |
| Au-delà de l'annuaire | **Bons de travaux / interventions** (assigner + suivre statut/coût/dates) |
| Métiers | **Liste fixe étendue** (validée serveur) |
| Gating | **Pro + Entreprise** via flag plan `has_artisans` |
| Catalogue partagé | Géré par le **super-admin** (`/admin`) ; lecture seule pour les agences |
| Artisan sur un bon de travaux | **Optionnel** (assignable après création) |

## 3. Modèle de données

### 3.1 `Artisan` (`backend/app/models/artisan.py`)
`id`, `agency_id` (FK nullable — **null = catalogue partagé plateforme**), `trade` (id de métier,
validé), `name`, `company`, `city`, `phone`, `email`, `notes`, `created_by` (FK users nullable),
`created_at`, `updated_at`. `to_dict()` inclut `is_shared` (= `agency_id is None`).

### 3.2 `WorkOrder` (`backend/app/models/artisan.py`)
`id`, `agency_id` (FK, index), `artisan_id` (FK nullable), `property_id` (FK nullable), `title`,
`trade`, `status` (`requested`/`scheduled`/`in_progress`/`done`/`cancelled`, défaut `requested`),
`cost_estimate` (Numeric nullable), `cost_final` (Numeric nullable), `scheduled_date` (nullable),
`completed_at` (nullable), `notes`, `created_by`, `created_at`, `updated_at`. `to_dict()` inclut un
résumé `artisan` (nom/métier).

### 3.3 `SubscriptionPlan` (ajout) — `has_artisans` (Boolean, défaut False) + `to_dict()`.

### 3.4 Migration
`add_artisans` : tables `artisans`, `work_orders` + colonne `subscription_plans.has_artisans`.
`down_revision` = tête courante. Rétro-compatible.

## 4. Métiers (constante backend)
`backend/app/services/artisan_trades.py` : `ARTISAN_TRADES = [{'id','label'}...]` :
plombier, électricien, ménage, menuisier, peintre, architecte d'intérieur, maçon, chauffagiste,
serrurier, jardinier, autre. Helper `is_valid_trade(trade) -> bool`. Utilisé pour valider `trade`
(Artisan et WorkOrder) — un métier inconnu → `400`.

## 5. Gating & autorisation
- Garde backoffice `require_artisans` (après `require_auth`) → `403` sauf si le plan de l'agence a
  `has_artisans` (« Fonction réservée aux plans Pro et Entreprise »). Modelée sur `require_contracts`
  (brique 4).
- **Isolation** :
  - Annuaire `GET` : renvoie les artisans **partagés** (`agency_id null`) **+** ceux de l'agence.
  - `POST/PUT/DELETE` backoffice : uniquement sur ses artisans **privés** (`agency_id == g.agency_id`) ;
    un artisan partagé ou d'une autre agence → `404` (jamais modifiable côté agence).
  - Bons de travaux : strictement agency-scoped (`g.agency_id`) ; `artisan_id` assigné doit être
    **accessible** (partagé ou propre) sinon `400` ; `property_id` doit appartenir à l'agence.
- Catalogue **partagé** : CRUD réservé au **super-admin** via `/admin` (`require_superadmin`, brique 1) ;
  opère uniquement sur les artisans `agency_id=null`.

## 6. API

### 6.1 Backoffice — `backend/app/api/v1/backoffice/artisans.py` (`require_artisans`)
- `GET /backoffice/artisan-trades` → la liste des métiers (constante).
- `GET /backoffice/artisans?trade=&city=&q=` → partagés + propres (filtres).
- `POST /backoffice/artisans` `{trade, name, company?, city?, phone?, email?, notes?}` → crée un
  artisan **privé** (`agency_id=g.agency_id`) ; `trade` validé.
- `PUT`/`DELETE /backoffice/artisans/:id` → sur ses artisans privés uniquement.
- `GET /backoffice/work-orders?status=&property_id=` — liste (agence).
- `POST /backoffice/work-orders` `{title, trade, artisan_id?, property_id?, cost_estimate?, scheduled_date?, notes?}`
  → `trade` validé ; `artisan_id` (si fourni) accessible ; `property_id` (si fourni) de l'agence.
- `GET /backoffice/work-orders/:id`.
- `PUT /backoffice/work-orders/:id` `{title?, status?, artisan_id?, cost_estimate?, cost_final?, scheduled_date?, notes?, property_id?}`
  → `status='done'` renseigne `completed_at`, sinon le laisse/efface ; `artisan_id`/`property_id` re-validés.
- `DELETE /backoffice/work-orders/:id`.

### 6.2 Super-admin — `backend/app/api/v1/admin/artisans.py` (`require_superadmin`)
- `GET /admin/shared-artisans?trade=&q=` — catalogue partagé (`agency_id null`).
- `POST /admin/shared-artisans` `{trade, name, ...}` → crée `agency_id=null` (partagé).
- `PUT`/`DELETE /admin/shared-artisans/:id` — uniquement sur les artisans **partagés** (`agency_id null`) ;
  un artisan privé d'agence → `404`.

## 7. Front

### 7.1 Backoffice — `has_artisans` requis
- `ArtisansDirectory` (`frontend/src/pages/backoffice/artisans/`) : annuaire filtrable (métier, ville,
  recherche), badge **Partagé** / **Mon agence** ; formulaire créer/éditer/supprimer un artisan **privé**
  (les partagés en lecture seule). Masqué/verrouillé (CTA upgrade) sur `403`.
- `WorkOrdersList` + `WorkOrderDetail` : liste (titre, métier, artisan, bien, statut, coût) + détail
  (assigner artisan depuis l'annuaire, statut, coûts estimé/final, date planifiée, notes).
- Entrées de menu backoffice « Artisans » + « Travaux » gardées par `has_artisans`.
- `artisanService.js`.

### 7.2 Super-admin — `/admin`
- `AdminSharedArtisans` (`frontend/src/pages/admin/`) : CRUD du catalogue partagé, ajouté au menu
  super-admin de la brique 1. `adminService` étendu (ou un petit service dédié).

## 8. Seed
- `has_artisans=True` sur `pro` et `enterprise`.
- Quelques artisans **partagés** de démo (`agency_id=null`, métiers variés) + 1-2 **privés** par agence.
- Les métiers sont une **constante de code** (pas de seed).

## 9. Tests (avant « terminé »)
**Backend (scripts Python)** :
- garde : agence sans `has_artisans` → `403` ; avec → `200`.
- annuaire : `GET` renvoie partagés + propres ; filtre `trade`/`city` ; `trade` invalide au `POST` → `400`.
- isolation : une agence ne peut PUT/DELETE un artisan **partagé** ni d'une autre agence (`404`) ;
  agence B ne voit/altère pas les artisans privés / work orders de A.
- super-admin : CRUD des partagés ; un `PUT/DELETE` super-admin sur un artisan **privé** → `404`.
- work orders : création (artisan optionnel) ; `artisan_id` inaccessible → `400` ; `property_id` d'une
  autre agence → `400` ; `PUT status='done'` → `completed_at` ; suppression.
**Frontend** : `/backoffice/artisans`, `/backoffice/travaux`, `/admin/artisans-partages` rendent 200 ;
build prod OK ; smoke test : ajouter un artisan privé, voir un partagé (lecture seule), créer un bon de
travaux, assigner un artisan, suivre le statut ; en super-admin, ajouter un artisan partagé visible par
les agences.

## 10. Fichiers touchés (indicatif)
- **Backend** : `models/artisan.py` (new), `models/subscription.py` (+`has_artisans`), `models/__init__.py`,
  migration `add_artisans`, `services/artisan_trades.py` (new), `api/v1/backoffice/artisans.py` (new) +
  enregistrement, `api/v1/admin/artisans.py` (new) + enregistrement dans `admin/__init__.py`,
  `seed_backoffice.py` (flag + artisans démo), `scripts/verify_artisans_*.py`.
- **Frontend** : `pages/backoffice/artisans/*` (Directory, WorkOrdersList, WorkOrderDetail),
  `pages/admin/AdminSharedArtisans.jsx`, `services/artisanService.js`, câblage routeur + menus (backoffice
  + super-admin).

## 11. Séquencement (pour le plan)
(1) modèles + `has_artisans` + migration ; (2) métiers (constante) + seed flag/artisans ; (3) garde
`require_artisans` + API annuaire (GET partagés+propres, CRUD privés) + métiers ; (4) API bons de travaux ;
(5) API super-admin catalogue partagé ; (6) front annuaire artisans (service + directory + gating + route/menu) ;
(7) front bons de travaux (liste + détail) ; (8) front super-admin partagés ; (9) vérif intégrée + build.

---

## Annexe — décomposition globale
0. ❤️ · 1. 🛡️ Super-admin — livré · 2. 👥 Équipes — livré · 3. 📊 Dashboard — livré ·
4. 📄 Contrats — livré · 5. ⚖️ Juridique & notaires — livré · **6. 🔧 Artisans — cette spec** ·
7. 🛋️ Marketplace meubles & électroménager.
