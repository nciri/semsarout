# Spec — Charges de copropriété (semsarout + m3a-l3achrane)

**Date :** 2026-08-10
**Branche :** `feature/charges-copropriete` (depuis `develop`)

## Objectif

Permettre de renseigner et d'afficher les **charges de copropriété** d'un bien,
en **vente comme en location**, dans les deux produits (semsarout et
m3a-l3achrane), lorsque le bien est **en copropriété**. Le bloc de saisie est
affiché par défaut, sauf pour un bien de type **terrain** (`land`, semsarout
uniquement — le coloc n'a pas de terrain).

Trois lots, livrables et commités séparément :

- **Lot 1 — Cohérence devise m3a** : remplacer `MAD` par le symbole `Đh` (déjà
  utilisé partout dans semsarout) dans tout `frontend-m3a-l3achrane`.
- **Lot 2 — Charges de copropriété** : la fonctionnalité elle-même (données,
  backend, formulaires semsarout, affichage semsarout + m3a).
- **Lot 3 — « Déposer une annonce » (m3a)** : écran de création d'annonce
  (wizard 4 étapes + photos), aujourd'hui inexistant côté front m3a ; intègre les
  charges de copropriété du Lot 2.

---

## Lot 1 — Cohérence devise m3a (`MAD` → `Đh`)

Symbole de référence : `frontend/src/utils/currency.js` →
`export const DIRHAM_SYMBOL = 'Đh'` (rendu type « 4 900 Đh »). Le coloc utilise
`MAD` ; on l'aligne.

**Fichiers :**
- `frontend-m3a-l3achrane/src/lib/format.js` — `formatMad()` : remplacer le
  littéral `MAD` par `Đh` (conserver l'espace insécable `NB`). La fonction garde
  son nom (`formatMad`) pour limiter la surface ; seul le rendu change.
- `frontend-m3a-l3achrane/src/lib/format.test.mjs` — mettre à jour les
  assertions (`…MAD…` → `…Đh…`).
- i18n FR **et** AR (parité obligatoire) :
  - `locales/{fr,ar}/app.json` : `candidatures.rentLabel`, `candidatures.depositLabel`,
    `payButton` (`Payer {{amount}} MAD` → `Đh`), `listingSubtitle` (`{{prix}} MAD/mois`).
  - `locales/{fr,ar}/web.json` : chips de budget (`"1 500 MAD"`…), `budgetUnitNote`
    (`"MAD / mois, charges comprises"` → `"Đh / mois, charges comprises"`).
- Vérifier `frontend-m3a-l3achrane/src/ds/listing/PriceTag.jsx` : s'il porte un
  littéral devise, l'aligner ; s'il consomme `formatMad`, rien à faire.

**Hors périmètre :** `currency: 'MAD'` dans les données/mocks (code ISO, correct)
et les tests qui vérifient le champ `currency`. On ne touche que l'**affichage**.

**Critère de recette :** `grep -rn "MAD" frontend-m3a-l3achrane/src` ne renvoie
plus que des occurrences de code ISO (`currency: 'MAD'`), aucune chaîne visible.

---

## Lot 2 — Charges de copropriété

### Données

Colonnes dédiées `is_condo` (booléen « en copropriété ») + `condo_fees`
(montant mensuel). Distinctes des charges locatives existantes du coloc
(`charges_included`/`charges_amount`), laissées inchangées.

| App | Modèle | Ajouts |
|---|---|---|
| semsarout | `backend/app/models/property.py` `Property` | `is_condo BOOLEAN DEFAULT false`, `condo_fees NUMERIC(10,2)` (nullable) |
| semsarout (miroir) | `services/listing/app/models.py` | idem |
| m3a | `services/coloc-listing/app/models.py` `Listing` | `is_condo BOOLEAN DEFAULT false`, `condo_fees NUMERIC(12,2)` (nullable) |

Sérialisation : ajouter `is_condo` + `condo_fees` à chaque `to_dict()`.

**Migrations** (additives, à écrire selon le mécanisme de chaque service) :
- semsarout : monolithe Flask sous **Alembic** (`backend/migrations/`) → nouvelle
  révision ajoutant les deux colonnes à `properties`.
- coloc-listing : suivre le patron `services/*/db/*.sql` (cf.
  `services/messaging/db/migrate_notification.sql`) → `ALTER TABLE listings ADD …`.
- Le miroir `services/listing` partage la table `properties` du monolithe ; pas de
  migration séparée (mêmes colonnes).

### Règle métier

- `is_condo` **coché par défaut** à la création d'un bien **non-terrain**.
- Le bloc (toggle + montant) est **masqué** si `property_type === 'land'`
  (semsarout). Le coloc n'a pas de terrain → toujours affiché.
- `is_condo` coché → révèle le champ **« Charges de copropriété (Đh/mois) »**,
  montant **optionnel** (pas de champ requis, pas d'astérisque).
- Backend semsarout : si `property_type === 'land'`, forcer `is_condo=false` et
  `condo_fees=null` (garde côté serveur, indépendante du front).

### Backend

- **semsarout** `backend/app/api/v1/properties.py` :
  - `POST /properties` : lire `is_condo` (défaut `true` si `property_type != 'land'`,
    sinon `false`) et `condo_fees` ; appliquer la garde terrain.
  - `PUT /properties/<id>` : ajouter `is_condo`, `condo_fees` aux `updatable_fields`
    (avec la même garde terrain).
  - `to_dict` : déjà géré par le modèle.
- **coloc** :
  - `services/coloc-listing/app/schemas.py` : `ListingCreateIn` + `ListingUpdateIn`
    → `is_condo: bool = True`, `condo_fees: Decimal | None = None`.
  - `services/coloc-listing/app/main.py` (route création) : mapper les deux champs.

### Frontend semsarout

Composant partagé de bloc « copropriété » (checkbox + montant conditionnel),
réutilisé par les 3 formulaires pour éviter la duplication :

- `frontend/src/pages/dashboard/CreateProperty.jsx`
- `frontend/src/pages/SellProperty.jsx` (wizard vente)
- `frontend/src/pages/backoffice/PropertyForm.jsx`

Comportement : bloc masqué si `property_type === 'land'` ; `is_condo` par défaut
`true` sur les autres types ; montant révélé si coché ; inclus dans le payload
(`is_condo`, `condo_fees`). Suivre la skill `form-design` (indicateur requis
seulement sur les champs requis ; ici optionnel → aucun).

**Affichage** : `frontend/src/pages/PropertyDetail.jsx`, section « Détails » →
ligne « Charges de copropriété : `formatté` Đh/mois » si `property.is_condo`
(et masquée sinon / pour terrain). Formatage via l'util devise existant.

### Frontend m3a-l3achrane

- `src/services/mappers.js` (`mapListingDetail`, `mapListingHit`) : exposer
  `isCondo` (bool) et `condoFees` (nombre) depuis le `to_dict`.
- **Détail** `src/surfaces/web/ListingDetail.jsx` : ligne « Charges de copropriété :
  `X` Đh/mois » si `isCondo`.
- **Carte** `src/ds/listing/ListingCard.jsx` (+ `PriceTag.jsx`) : quand
  `isCondo && condoFees > 0`, afficher le **total = loyer + condoFees** avec un
  marqueur **« +cc »** (charges comprises) à côté, période `/mois`. Sinon,
  affichage inchangé (loyer seul).
- **Back-office modération** (`src/surfaces/backoffice/BackOffice.jsx`) : ce
  back-office ne fait qu'**approuver/rejeter** (pas d'édition de champs
  d'annonce). Il n'y a donc **pas de formulaire de saisie** à modifier. La saisie
  des charges de copropriété côté coloc passe par l'**API `POST/PUT /listings`**
  (couverte par la section Backend). Dans la file de modération, si l'aperçu de
  l'annonce montre les infos financières (loyer…), y ajouter en **lecture seule**
  « Charges de copropriété : X Đh/mois » quand `is_condo` — pour que le modérateur
  la voie. Aucun éditeur de champ n'est introduit.
- i18n FR + AR : clés `condoFeesLabel` (« Charges de copropriété »),
  `condoToggleLabel` (« Bien en copropriété »), `chargesComprisesShort` (« +cc »).

### i18n (récap clés à ajouter, FR + AR, chaque app)

- semsarout : label du toggle, label du champ montant, ligne d'affichage détail.
- m3a : idem + `+cc`.

### Tests

- **Backend semsarout** (`backend/tests/`) : create/update d'un bien →
  `is_condo`/`condo_fees` persistés et dans `to_dict` ; un bien `land` force
  `is_condo=false`/`condo_fees=null`.
- **Backend coloc** (`services/coloc-listing/tests/`) : create/update annonce →
  champs persistés + sérialisés.
- **Front semsarout** : le bloc s'affiche (non-terrain) / se masque (terrain) ;
  payload inclut les champs ; détail affiche la ligne si `is_condo`.
- **Front m3a** : `mappers` exposent `isCondo`/`condoFees` ; carte calcule le total
  `loyer + condoFees` avec « +cc » ; `format` rend `Đh` ; parité i18n FR/AR.

### Critères d'acceptation

1. En vente et en location (semsarout), un bien non-terrain propose « Bien en
   copropriété » coché par défaut + montant ; un terrain ne le propose pas.
2. La page détail semsarout affiche « Charges de copropriété : X Đh/mois » quand
   renseigné.
3. Côté m3a, la carte affiche loyer+charges avec « +cc », le détail affiche la
   ligne de charges, et toutes les devises s'affichent en `Đh`.
4. Backend : garde terrain effective ; champs sérialisés ; migrations additives.
5. `lint`, `test`, `build` verts (semsarout + m3a) ; pytest verts (monolithe +
   coloc-listing) ; parité i18n m3a.

---

## Lot 3 — « Déposer une annonce » (m3a)

Aujourd'hui **aucun écran de création** d'annonce n'existe côté front m3a (les
annonces viennent du seed / d'appels API directs). Le domaine backend gère
pourtant tout le cycle : `POST /listings` (crée en `BROUILLON`) →
`POST /listings/{id}/media` (enregistre une URL) → `POST /listings/{id}/submit`
(`EN_MODERATION`) → approbation superadmin (`PUBLIEE`). On construit l'écran
propriétaire qui orchestre ce cycle, charges de copropriété (Lot 2) incluses.

### Route & accès
- Nouvelle route `/espace/publier` sous `AppLayout` (espace authentifié), + une
  entrée de navigation dans `AppLayout`. Gating d'auth cohérent avec les autres
  écrans `/espace` (l'API renvoie 401 sinon).

### Wizard — 4 étapes
Contrat cible : `ListingCreateIn` (schemas coloc) + `is_condo`/`condo_fees`.
Enums : `PROPERTY_TYPES` (APPARTEMENT, MAISON, VILLA, STUDIO,
RESIDENCE_ETUDIANTE, CHEZ_HABITANT), `BED_TYPES` (CHAMBRE_INDIVIDUELLE,
CHAMBRE_PARTAGEE, LIT_DORTOIR, STUDIO_ENTIER, APPARTEMENT_ENTIER),
`HOUSING_GENDERS` (FEMININ, MASCULIN — **MIXTE_FAMILIAL exclu**, refusé côté
serveur), `MEDIA_TYPES` (CHAMBRE, PARTIES_COMMUNES, AUTRE).

1. **Le bien** : ville\*, quartier, adresse, `property_type`\* (Select), étage,
   surface `area_m2`, équipements `amenities` (quelques toggles courants → dict).
2. **Le logement** : titre\*, description (Textarea), `bed_type`\* (Select),
   `housing_gender`\* (Select FEMININ/MASCULIN), meublé (Checkbox), capacité 1-8.
3. **Prix & charges** : loyer\* (`rent`, Đh), charges locatives incluses
   (`charges_included`) → montant (`charges_amount`), caution (`deposit`), **bloc
   copropriété du Lot 2** : « Bien en copropriété » (`is_condo`, coché par défaut)
   → « Charges de copropriété (Đh/mois) » (`condo_fees`).
4. **Disponibilité & photos** : `available_from` (date), `duration_min_months`,
   `duration_max_months`, **photos** : sélection de fichiers, `media_type` par
   photo (CHAMBRE/PARTIES_COMMUNES/AUTRE) et ordre (`position`).

Champs requis (astérisque rouge, skill `form-design`) : titre, ville,
`property_type`, `bed_type`, `housing_gender`, loyer. Validation par étape avant
« Suivant ». `currency` fixé à `MAD` en base (affiché `Đh`).

### Action « Publier » (un geste)
Séquence orchestrée par le front, l'annonce restant `BROUILLON` jusqu'au submit
(le endpoint `/media` exige `editable_only`) :
1. `POST /api/v1/listings` → crée en `BROUILLON`, renvoie l'`id`.
2. Pour chaque photo : `POST /api/v1/uploads` (multipart, service `listing`
   partagé → renvoie `/uploads/photos/xxx.jpg`) puis
   `POST /api/v1/listings/{id}/media` (`{url, position, media_type}`).
3. `POST /api/v1/listings/{id}/submit` → `EN_MODERATION`.
4. Écran de succès « Annonce envoyée en modération ».
En cas d'échec après création : l'annonce reste en brouillon (pas de rollback
serveur) ; message d'erreur invitant à réessayer.

### Ajouts DS (`src/ds/core/`)
- `Textarea.jsx` (description) et `Checkbox.jsx` (booléens : charges incluses,
  meublé, en copropriété), au style du DS existant. Exportés via `ds/core/index.js`.

### Service (`src/services/index.js`)
- `createListing(payload)` → `POST /listings`.
- `uploadPhoto(file)` → `POST /uploads` (multipart), renvoie l'URL.
- `addListingMedia(id, {url, position, media_type})` → `POST /listings/{id}/media`.
- `submitListing(id)` → `POST /listings/{id}/submit`.

### Routage gateway (vérifié, rien à changer)
`POST /api/v1/listings`, `/listings/{id}/media`, `/listings/{id}/submit` sont
proxifiés vers `coloc-listing` (seul `GET /api/v1/listings` est composite).
`POST /api/v1/uploads` va au service `listing` (stockage objet partagé).

### i18n
FR + AR : libellés du wizard (étapes, champs, options d'enum, boutons), messages
de validation, écran de succès. Parité obligatoire.

### Tests
- Validation par étape (champs requis bloquants).
- Flux « Publier » : enchaînement create → upload×N → media×N → submit (API
  mockée), gestion d'erreur.
- Nouveaux composants DS (`Textarea`, `Checkbox`).
- Parité i18n FR/AR.

### Critères d'acceptation (Lot 3)
1. Un propriétaire authentifié atteint `/espace/publier` et parcourt les 4 étapes.
2. Les champs requis bloquent le passage à l'étape suivante.
3. L'étape 3 propose le bloc copropriété (coché par défaut).
4. « Publier » crée l'annonce, téléverse les photos, les rattache, puis soumet à
   la modération ; l'annonce apparaît alors dans la file du back-office.
5. `lint`, `test`, `build` m3a verts ; parité i18n.

## Hors périmètre

- **Écran « Mes annonces »** (liste + gestion de statut, `GET /me/listings`) :
  non inclus (le flux Lot 3 est create+submit en un geste, sans écran de gestion).
- Édition/suppression d'une annonce existante depuis le front m3a.
- Carte m3a « +cc » utilise `condo_fees` (copropriété), pas
  `charges_amount`/`charges_included` (charges locatives — concept distinct, non
  modifié).
- Pas de conversion de devise (MAD ISO conservé en données ; seul l'affichage
  passe à `Đh`).
- Pas de filtre de recherche par charges de copropriété.
