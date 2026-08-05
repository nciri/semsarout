# Améliorations du formulaire de programme immobilier — Design

**Date :** 2026-08-05
**Branche :** `feature/program-form-ameliorations` (tirée de `develop`, **sans i18n** — français codé en dur).
**⚠️ Conflit futur :** quand la Phase 1 i18n migrera les pages `dashboard` (`ProgramForm.jsx`, `ProgramPlanEditor.jsx`), il faudra résoudre un conflit de merge et re-migrer ces pages.

## Contexte

Le formulaire multi-étapes de création/édition d'un programme immobilier neuf (`frontend/src/pages/dashboard/ProgramForm.jsx`) et l'éditeur de plan interactif des lots (`ProgramPlanEditor.jsx`). Bug `FiEdit2 is not defined` **déjà corrigé** (commit sur cette branche).

Backend : service `services/programs` (mesh). `Program` a les colonnes `program_type`, `address`, `city`, `neighborhood`, `latitude`, `longitude`, `amenities` (JSON), `construction_status`, `delivery_date`, etc. `ProgramUnit` a `name`, `unit_type`, `surface_min/max`, `rooms`, `bedrooms`, `bathrooms`, prix, stock. Les lots (`ProgramPlanEditor`) sont gérés via `lotPlanService` (plans → lots avec polygone `zone`).

## Objectif

Trois évolutions indépendantes :
1. **Type → détails** : la typologie du programme pilote les champs (réordonnancement + adaptation hybride), persistée via une colonne JSON `specs`.
2. **Adresse** dans l'étape Localisation, prête pour l'auto-complétion Google Maps (branchement réel différé, payant).
3. **Plan des lots** : vider le formulaire après enregistrement + liste des lots créés avec actions (Modifier / Dupliquer / Supprimer).

## Décisions validées

- **Modèle hybride** : la typologie du programme pilote l'étape Détails, ET le formulaire d'unité s'adapte au type de chaque unité.
- **Typologie multi-select** : nouveau champ **multi-sélectionnable** (`Appartements` / `Villas` / `Terrains` / `Commercial`), stocké dans `specs.typology` (tableau). « Mixte » = plusieurs cases cochées (pas de valeur enum séparée).
- **Persistance** : colonne **JSON `specs`** sur `Program` ET `ProgramUnit` + prise en charge dans create/update du service `programs`.
- **Adresse** : mappée sur `Program.address` (+ `latitude`/`longitude` existants). Composant `AddressAutocomplete` avec API `onSelect({ address, lat, lng })`. **Google Maps branché en dernier.**
- **Plan des lots** : géré côté frontend uniquement (`ProgramPlanEditor` + `lotPlanService`).

## Non-objectifs

- Le **branchement réel à l'API Google Maps** (Places Autocomplete) — fait en dernier car payant. Le champ + le composant sont préparés.
- L'i18n de ces pages (branche séparée).

---

## Livrable 1 — Type → détails (+ specs)

### Étapes réordonnées
`Informations → Localisation → **Types de biens (dont typologie)** → **Détails** → Médias`.
(Aujourd'hui : Informations → Localisation → Détails → Types de biens → Médias. On échange Détails et Types de biens, et on place le sélecteur de typologie en tête de l'étape Types de biens.)

### Typologie
En tête de l'étape « Types de biens » : cases à cocher **Appartements / Villas / Terrains / Commercial** → `specs.typology = [...]`. Elle pilote :
- **Types d'unité proposés** = union des typologies cochées :
  - Appartements → `studio`, `apartment`, `duplex`, `penthouse`
  - Villas → `villa`, `duplex`
  - Terrains → `land` *(nouveau type, absent aujourd'hui)*
  - Commercial → `commercial`
- **Sections de l'étape Détails** : une section par typologie cochée.
- **Formulaire d'unité** : champs selon `unit_type`.

### Cartographie des champs (dans `specs`)
**Détails programme** — commun (colonnes existantes : `construction_status`, `delivery_date`, `description`, `amenities`) + une section `specs` par typologie :
- **Appartements** (`specs.apartments`) : `buildings_count` (nb bâtiments), `floors_count` (nb étages), `has_elevator` (bool), `monthly_charges` (charges/syndic estimées).
- **Villas** (`specs.villas`) : `land_surface_min`/`land_surface_max` (superficie terrain), `levels` (R+1/R+2…), `style` (moderne/traditionnel), `has_garage` (bool), `has_pool` (bool).
- **Terrains** (`specs.land`) : `serviced` (objet booléens : `water`, `electricity`, `sewage`, `road`), `title_type` (type de titre foncier : melkia/titré/…), `buildability` (COS/CUS ou R+n, chaîne), `subdivision_allowed` (bool).
- **Commercial** (`specs.commercial`) : `local_type` (bureau/commerce/entrepôt), `allowed_use`, `standing`.

**Formulaire d'unité** — colonnes existantes (`name`, `unit_type`, `surface_min/max`, `rooms`, `bedrooms`, `bathrooms`, prix, stock) + `ProgramUnit.specs` selon `unit_type` :
- **Appart/Studio/Duplex/Penthouse** : + `floor` (étage), `orientation`, `has_balcony`/`has_terrace`.
- **Villa** : + `land_surface`, `living_surface`, `levels`, `has_garden`, `has_pool`, `garage_spots`.
- **Terrain (`land`)** : + `price_per_sqm`, `frontage` (façade ml), `buildable` (bool), `shape` (forme). **Masquer** `rooms`/`bedrooms`/`bathrooms`.
- **Local commercial** : + `floor`, `allowed_use`.

### Backend (`services/programs`)
- Migration : ajouter `specs` (JSON, nullable) sur `program` et `program_unit`.
- Modèle : `Program.specs`, `ProgramUnit.specs`.
- Endpoints create/update programme et create/update unité : accepter et renvoyer `specs`.

---

## Livrable 2 — Champ adresse (Localisation)

- Ajouter un champ **Adresse** à l'étape Localisation, lié à `formData.address` (déjà envoyé au backend `Program.address`).
- Nouveau composant `frontend/src/components/common/AddressAutocomplete.jsx` : input contrôlé + callback `onSelect({ address, lat, lng })`. Sans clé Google Maps, il se comporte comme un input libre (saisie manuelle de l'adresse). Il expose le point d'entrée pour brancher plus tard **Google Places Autocomplete** (qui remplira `address` + `latitude`/`longitude`).
- Le formulaire stocke `address`, `latitude`, `longitude` (colonnes existantes).

## Livrable 3 — Plan interactif des lots

Dans `ProgramPlanEditor.jsx` :
- Après **enregistrement** d'un lot (création réussie), appeler `resetSelection()` → le formulaire se vide, prêt pour le lot suivant.
- Sous le formulaire, afficher la **liste des lots** du plan actif (`activePlan.lots`) : chaque ligne = référence, titre, type, surface, badge statut. Actions en **icônes avec infobulles** (`title=`) :
  - **Modifier** (`FiEdit2`) → charge le lot dans le formulaire (`setSelectedLotId` + remplir `form`).
  - **Dupliquer** (`FiCopy`) → crée un nouveau lot avec les mêmes specs (référence incrémentée/suffixée), **zone non placée** (à redessiner) ou zone décalée — le lot dupliqué apparaît dans la liste, prêt à être positionné.
  - **Supprimer** (`FiTrash2`) → suppression (confirmation), `removeLotLocal`.
- Le survol d'une ligne peut surligner le lot correspondant sur le plan (nice-to-have, optionnel).

---

## Tests

Le frontend n'a pas d'infra de test sur `develop` (Vitest a été ajouté sur la branche i18n, pas ici). Deux options : (a) ajouter Vitest sur cette branche pour tester la logique pure (mapping typologie→champs, adaptation du formulaire d'unité, duplication de lot) ; (b) vérification manuelle + build. **Décision plan** : ajouter un test ciblé pour les fonctions pures extraites (ex. `unitFieldsFor(unit_type)`, `detailSectionsFor(typology)`, `duplicateLot(lot)`) via Vitest si l'installation reste légère ; sinon, extraire ces fonctions dans des modules purs et se limiter au build + revue. À trancher dans le plan.

## Contraintes

- Français codé en dur (pas de `t()` — branche sans i18n).
- `npm run build` vert à chaque étape ; l'app reste fonctionnelle.
- Compat ascendante : les programmes/unités existants sans `specs` s'affichent (champs adaptatifs vides), et un programme sans `typology` retombe sur un comportement générique.
- Suivre les patterns existants (Tailwind, react-query, structure des composants).
