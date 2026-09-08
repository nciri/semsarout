# Spec — Module conception 3D, brique 1 : éditeur de plan 2D (`design3d`)

**Date :** 2026-09-08 · **Branche :** `feature/design3d-floorplan` (depuis `develop`)

## Contexte

Module payant activable/désactivable permettant à un agent de concevoir
l'aménagement intérieur d'un bien en 3D et d'en générer des visuels
photoréalistes pour l'acheteur. Brainstorming du 2026-09-08 : le chantier est
découpé en 5 briques indépendantes, livrées dans l'ordre :

1. **Éditeur de plan 2D** — cette spec.
2. Scène 3D + aménagement (Three.js), avec catalogue générique.
3. Pipeline de rendu IA (img2img contrôlé par la géométrie, worker, MinIO,
   mention « visualisation générée, non contractuelle »).
4. Catalogue partenaires (enseignes réelles — dépend de négociations).
5. Monétisation : add-on billing + crédits de rendu.

Périmètre biens : vente (existant), location, programmes neufs (VEFA).

## Décisions actées

- Éditeur **SVG maison**, même paradigme que `ProgramPlanEditor.jsx` (pas de
  librairie canvas, pas de fork d'éditeur tiers).
- Deux entrées, un éditeur : **calque** sur plan uploadé (calibration
  obligatoire sur une cote connue) et **dessin libre** (grille métrique,
  longueurs saisies).
- **Pièces tracées explicitement** (polygones typés), pas de détection
  automatique depuis les murs.
- **Ouvertures minimales** (porte/fenêtre posées sur un mur, largeur/hauteur/
  allège), sans sens d'ouverture.
- **Multi-niveaux** dès le modèle, un niveau affiché à la fois.
- Géométrie stockée **en mètres** (pas en coordonnées normalisées) : la 3D et
  les meubles des briques suivantes en dépendent.

## Service `services/design3d`

Port **8526**, schéma DB `design3d`, patron `services/partner` (FastAPI +
SQLAlchemy + outbox, `_require_tenant` non nécessaire : multi-tenant via
`principal`). Propriétaire des projets de conception ; accueillera scènes 3D,
jobs de rendu et catalogue (briques 2-4) — un seul domaine.

### Modèle de données

**`DesignProject`** — `id` (BigInteger), `tenant` (String 30), `agency_id`
(Integer, nullable, index), `owner_id` (Integer, index), `target_type`
(`property` | `program_lot`), `target_id` (BigInteger), `title` (String 200),
`status` (`draft` | `ready`, défaut `draft`), `created_at`, `updated_at`.
Index `(target_type, target_id)`. Un bien peut avoir plusieurs projets.

**`DesignLevel`** — `id`, `project_id` (FK cascade), `name` (String 60),
`position` (Integer), `background_image_key` (String 255, nullable — objet
MinIO), `show_background_public` (Boolean, défaut false), `calibration` (JSON
nullable : `{"p1": {"x","y"}, "p2": {"x","y"}, "meters": float}` — `p1`/`p2`
en coordonnées normalisées 0-1 de l'image de fond), `wall_height_m` (Numeric
4,2, défaut 2.70), `geometry` (JSON, défaut `{"walls": [], "rooms": [],
"openings": []}`), `revision` (Integer, défaut 0), `created_at`, `updated_at`.

**Document `geometry`** (mètres, origine en haut à gauche, y vers le bas) :

```json
{
  "walls":    [{"id": "w1", "a": {"x": 0, "y": 0}, "b": {"x": 4.2, "y": 0}, "thickness_m": 0.2}],
  "rooms":    [{"id": "r1", "type": "living", "name": "Salon", "polygon": [{"x":0,"y":0}, {"x":4.2,"y":0}, {"x":4.2,"y":3.5}, {"x":0,"y":3.5}]}],
  "openings": [{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": 1.0, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}]
}
```

Types de pièce (clés stables, libellés i18n) : `living`, `bedroom`, `kitchen`,
`bathroom`, `wc`, `hallway`, `balcony`, `garage`, `other`.

Validation serveur (Pydantic, 422 sinon) : mur = 2 points distincts,
`thickness_m` ∈ ]0, 1] ; pièce = polygone ≥ 3 points ; ouverture référence un
`wall_id` existant, `width_m > 0`, `offset_m + width_m ≤ longueur du mur`,
`sill_m + height_m ≤ wall_height_m` ; ids uniques par collection ; taille du
document ≤ 512 Ko.

Toutes les mutations émettent un événement outbox (`design3d.project.created`,
`design3d.level.updated`, `design3d.project.ready`) — consommateur : aucun dans
cette brique (la brique 3 s'en servira pour invalider des rendus).

### Autorisation

- Toute route `/design3d/*` : `get_principal` + **entitlement** `design3d`
  dans `principal.features` (403 « Module conception 3D non activé » sinon).
- Cloisonnement, patron `_bo_access` de listing : agence → même
  `agency_id` ; sans agence → `owner_id` du principal.
- Lecture publique `/public/design3d/projects/{id}` : sans auth, uniquement si
  `status = ready` ; `background_image_key` n'est exposé que si
  `show_background_public` est vrai.

### Endpoints

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/design3d/projects` | crée un projet (+ un niveau « RDC » par défaut) |
| GET | `/design3d/projects?target_type=&target_id=` | projets d'un bien/lot (cloisonnés) |
| GET | `/design3d/projects/{id}` | projet + niveaux + géométrie |
| PUT | `/design3d/projects/{id}` | titre, statut |
| DELETE | `/design3d/projects/{id}` | suppression (cascade niveaux + objets MinIO) |
| POST | `/design3d/projects/{id}/levels` | ajoute un niveau |
| PUT | `/design3d/levels/{id}` | nom, position, `wall_height_m`, `calibration`, `geometry`, `show_background_public` — corps porte `revision` attendu ; **409** si ≠ révision courante, sinon révision +1 |
| DELETE | `/design3d/levels/{id}` | suppression (refusée si dernier niveau) |
| POST | `/design3d/levels/{id}/background` | upload image (PNG/JPEG ≤ 10 Mo) → MinIO, retourne l'URL signée |
| POST | `/design3d/levels/{id}/recalibrate` | nouvelle calibration + remise à l'échelle proportionnelle de la géométrie existante (serveur, pour garder une seule implémentation) |
| GET | `/public/design3d/projects/{id}` | lecture acheteur (`ready` seulement) |

Réponses JSON (`to_dict`), erreurs `{"error": msg}` (patron legacy des
services métier).

### Stockage

Bucket MinIO `semsar-design-plans` (lib `semsar_storage`, patron images
listing), clé `design3d/{project_id}/{level_id}/background.{ext}`. URL signée
courte durée pour l'éditeur ; proxy `/uploads` BFF pour la vue publique si
`show_background_public`.

## Frontend — éditeur (`frontend/`)

Route backoffice `/dashboard/conception/:projectId`
(`src/pages/dashboard/DesignEditor.jsx`), point d'entrée depuis la fiche du
bien (`PropertyForm`/`Properties`) et du lot de programme : bouton « Concevoir
en 3D » (visible seulement avec l'entitlement `design3d`, sinon vignette
« module à activer » → brique 5).

### Structure

- `src/utils/floorplan.js` — **logique géométrique pure, testée sans DOM** :
  `snapToGrid`, `snapToEndpoints`, `snapAngle` (0/45/90 avec Maj),
  `projectPointOnWall` (pose d'ouverture → `offset_m`), `wallLength`,
  `polygonArea` (shoelace), `normalizedToMeters`/`metersToNormalized` (depuis
  la calibration), `rescaleGeometry` (client, aperçu immédiat avant l'appel
  `/recalibrate`), `validateGeometry` (miroir de la validation serveur pour un
  retour immédiat).
- `src/components/design/` — `FloorplanCanvas.jsx` (SVG, viewBox en mètres
  avec zoom/pan), `Toolbar.jsx`, `PropertiesPanel.jsx`, `LevelTabs.jsx`,
  `CalibrationOverlay.jsx`, `DesignViewer.jsx` (lecture seule, réutilisé côté
  public).
- État : `useReducer` local (géométrie + sélection + outil + pile undo/redo de
  50), pas de store global.

### Parcours

1. **Création** : depuis le bien → « Nouveau projet » → titre → projet + niveau
   « RDC » → éditeur.
2. **Calque** : upload du fond → bandeau « Calibrez le plan » → outil de
   calibration actif seul : deux clics + saisie des mètres → outils déverrouillés.
   Recalibration possible depuis le panneau du niveau (aperçu client, puis
   `/recalibrate`).
3. **Dessin libre** : sans fond, grille métrique (0,5 m), 1 unité = 1 m ;
   chaque mur affiche sa longueur, éditable en tapant une valeur + Entrée.
4. **Outils** : Sélection · Mur (chaîne clic-clic, double-clic/Échap termine) ·
   Pièce (polygone puis type) · Porte · Fenêtre (clic sur un mur, défauts 0,9 m
   / 1,2 m) · Cotes on/off.
5. **Accrochage** : grille (0,1 m en calque, 0,5 m libre ; Alt désactive),
   extrémités et milieux des murs, angles avec Maj.
6. **Panneau latéral** : propriétés de l'élément sélectionné (mur : longueur,
   épaisseur 0,2/0,1 ; pièce : type, nom, surface calculée ; ouverture : type,
   largeur, hauteur, allège). Surface totale du niveau en permanence.
7. **Niveaux** : onglets, ajout/renommage/suppression (dernier niveau
   protégé).
8. **Sauvegarde** : bouton + auto-sauvegarde 30 s si modifié ; 409 → dialogue
   « modifié ailleurs : recharger / écraser ». Ctrl+Z / Ctrl+Y.
9. **Publication** : « Marquer prêt » (`status=ready`) → visible sur la fiche
   publique.

### Vue publique

`DesignViewer` sur `PropertyDetail.jsx` (et la fiche lot de programme) quand un
projet `ready` existe : plan propre (fond masqué sauf `show_background_public`),
pièces colorées par type avec surface et nom, ouvertures dessinées, onglets de
niveaux, surface totale. Valeur livrable dès cette brique, avant la 3D.

### i18n / RTL

Toutes les chaînes en `dashboard:designEditor.*` et `public:designViewer.*`,
FR + AR, icônes miroir via `DirIcon`, nombres formatés via `useFormat`. Les
types de pièce sont des clés stables traduites à l'affichage.

## Plomberie

- `services/design3d/db/schema.sql` (rôle + schéma, ADR-0002), `.env.example`.
- `scripts/dev-mesh-up.sh` : `design3d:8526` dans `SVCS`, relais outbox,
  `DESIGN3D_URL` pour le BFF, `$S3` + `DESIGN_PLANS_BUCKET=semsar-design-plans`
  dans l'`extra` du service.
- Gateway : `design3d_url` (config), `app.state.design3d`, règles
  `/api/v1/design3d*` et `/api/v1/public/design3d*` dans `_resolve_upstream`.
- CI : `services/design3d` dans `ALL` de `ci.yml`.
- Prod : `mesh_apps` + `mesh_relays` Ansible (`{name: design3d, port: 8526}`).
- **Billing** : colonne `has_design3d` sur `Plan` (+ `db/migrate_design3d.sql`
  ALTER), seed Pro/Enterprise = true, exposée dans les entitlements du JWT
  comme `design3d` (même chemin que `has_artisans` → `artisans`). La brique 5
  fera de ce flag un add-on payant avec crédits ; ici il gate seulement.
- `tools/check_env_examples.py` : port 8526 → `design3d` dans `KNOWN_PORTS`.

## Tests

**Backend** (`services/design3d/tests`, sqlite + `dependency_overrides`) :
entitlement (403 sans `design3d`) ; cloisonnement croisé agence/propriétaire ;
CRUD projets/niveaux ; création de projet crée un niveau par défaut ;
suppression du dernier niveau refusée ; `PUT /levels/{id}` incrémente
`revision`, 409 sur révision obsolète ; chaque règle de validation de
`geometry` (mur dégénéré, ouverture hors mur, ouverture orpheline, polygone à
2 points, allège + hauteur > hauteur de mur) ; `recalibrate` remet à l'échelle
murs/pièces/ouvertures proportionnellement ; lecture publique 404 tant que
`draft`, fond masqué sauf `show_background_public`.

**Frontend** : `floorplan.test.js` (vitest) pour chaque fonction de
`utils/floorplan.js` avec cas limites (mur vertical/horizontal/diagonal,
polygone concave, point hors segment, calibration dégénérée) ;
`DesignEditor.test.jsx` rendu FR/AR (patron `PropertyForm.test.jsx`) ;
`noHardcodedText` et parité i18n.

## Hors périmètre (briques suivantes ou plus tard)

- Scène 3D, meubles, matériaux (brique 2) ; rendus IA (3) ; catalogue
  partenaires (4) ; add-on payant et crédits (5).
- Conversion PDF → image côté serveur (image uniquement dans un premier temps).
- Import DXF/IFC, détection automatique des pièces, sens d'ouverture des
  portes, murs courbes, escaliers.
- Collaboration temps réel (le `revision` + 409 suffit pour l'instant).
