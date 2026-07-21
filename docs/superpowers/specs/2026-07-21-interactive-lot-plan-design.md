# Plan interactif des lots — Design

## Contexte

Permettre à un **promoteur** de définir visuellement l'emplacement des lots sur le
plan d'un programme, avec un **statut coloré** par lot (disponible / réservé /
vendu), et à un **acheteur** de visualiser ce plan et de sélectionner les lots qui
l'intéressent.

Approche validée avec l'utilisateur :

- **Plan interactif 2.5D** : image de fond + zones **polygonales** dessinées en SVG
  (coordonnées normalisées 0–1, donc responsive), colorées par statut. Pas de
  librairie 3D.
- **Lot autonome** : chaque lot porte ses propres caractéristiques (pas de type
  parent). Adapté aux lotissements/terrains hétérogènes.
- **Manifestation d'intérêt simple** : la sélection acheteur crée un `Lead` ; le
  statut du lot n'est **jamais** modifié par l'acheteur (le promoteur seul gère).

## Modèle de données

### `ProgramPlan` (nouvelle table `program_plans`)
`id`, `program_id` (FK), `name` (ex "Plan de masse", "Étage 3"), `image_url`,
`position` (ordre), `created_at`. Un programme a plusieurs plans ; chaque plan a
plusieurs lots (cascade delete).

### `ProgramLot` (nouvelle table `program_lots`)
`id`, `program_id` (FK), `plan_id` (FK), `reference` (ex "A302"), `title`,
`lot_type` (apartment/villa/terrain/commercial/office/duplex/studio),
`surface` (float), `rooms`/`bedrooms`/`bathrooms` (int), `price` (numeric),
`floor` (int), `status` (`available` | `reserved` | `sold`, défaut `available`),
`zone` (JSON — liste de points `{x, y}` normalisés 0–1), `description` (text),
`image_url`, `created_at`, `updated_at`. Méthode `to_dict()`.

## API (extension de `backend/app/api/v1/programs.py`)

**Public**
- `GET /programs/<program_id>/plans` → `{ plans: [{ ..., lots: [...],
  status_counts: { available, reserved, sold } }] }`

**Propriétaire** (réutilise le contrôle de propriété des autres endpoints
programmes : l'agence de l'utilisateur possède le programme)
- `POST/PUT/DELETE /programs/<program_id>/plans[/<plan_id>]`
- `POST/PUT/DELETE /programs/<program_id>/lots[/<lot_id>]`
- `PATCH /programs/<program_id>/lots/<lot_id>/status`

**Intérêt** (public ou connecté)
- `POST /programs/<program_id>/lots/interest` — body `{ lot_ids, name, email,
  phone, message }` → crée un `Lead` (source `contact_form`) référençant les lots
  dans le message, incrémente `program.contacts_count`, notifie le promoteur par
  email (mailer existant, contenu utilisateur échappé).

## Frontend

### Éditeur promoteur — `/dashboard/programmes/:id/plan`
- Onglets de plans + « Ajouter un plan » (upload image via `/uploads`).
- Zone d'édition : `<img>` + calque SVG (`viewBox 0 0 1000 1000`).
- Outil « Dessiner un lot » : clics pour poser les sommets, double-clic pour
  fermer → ouvre le formulaire du lot (panneau latéral).
- Clic sur une zone existante → édition des specs, **sommets déplaçables**,
  menu **statut** coloré, suppression. Couleurs de statut en direct.

### Visualiseur acheteur — composant intégré dans `ProgramDetail`
- Sélecteur de plans, image + zones SVG colorées, **légende avec compteurs**.
- Survol → surbrillance + infobulle (réf, surface, prix). Clic sur un lot
  **disponible** → détail + « Ajouter à ma sélection ». Réservés/vendus grisés,
  non sélectionnables.
- Barre de sélection → formulaire d'intérêt → `POST .../lots/interest`.

### Service
`frontend/src/services/lotPlanService.js`.

## Accès & statuts
- Éditeur : propriétaire uniquement (agence propriétaire du programme).
- Visualiseur : public (programme actif).
- Couleurs : disponible `#16a34a`, réservé `#d97706`, vendu `#dc2626`.

## Migration
`add_program_plans_and_lots` : création des tables `program_plans` et
`program_lots`.

## Hors périmètre (YAGNI)
Vraie 3D, réservation automatique par l'acheteur, galeries multi-photos par lot,
lots partagés entre plusieurs plans.
