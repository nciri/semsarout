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
- **Hors-ligne par défaut** : l'éditeur travaille sur une copie locale
  (IndexedDB), la synchronisation se fait en arrière-plan sans bloquer ;
  portée limitée au module de conception (pas au reste du backoffice).
- **Conflits** : les changements du **propriétaire du projet priment
  toujours** ; il est averti des modifications faites par d'autres et peut
  les récupérer, à charge pour lui de résoudre les conflits manuellement.
- **Tablette d'abord** : UI tactile (doigts, pas de stylet requis), adaptée
  aux tailles 8" → 13" en portrait et paysage ; installable en PWA
  (plein écran, ouverture hors-ligne).

## Service `services/design3d`

Port **8526**, schéma DB `design3d`, patron `services/partner` (FastAPI +
SQLAlchemy + outbox, `_require_tenant` non nécessaire : multi-tenant via
`principal`). Propriétaire des projets de conception ; accueillera scènes 3D,
jobs de rendu et catalogue (briques 2-4) — un seul domaine.

### Modèle de données

Les identifiants de projet et de niveau sont des **UUID générés côté
client** (String 36, patron `partner`) : un projet créé hors-ligne a déjà son
identifiant définitif, aucune réécriture d'id à la synchronisation. Le serveur
refuse un UUID déjà pris par un autre tenant/propriétaire (409).

**`DesignProject`** — `id` (UUID str), `tenant` (String 30), `agency_id`
(Integer, nullable, index), `owner_id` (Integer, index — **le propriétaire
du projet**, dont les changements priment), `target_type`
(`property` | `program_lot`), `target_id` (BigInteger), `title` (String 200),
`status` (`draft` | `ready`, défaut `draft`), `created_at`, `updated_at`.
Index `(target_type, target_id)`. Un bien peut avoir plusieurs projets.

**`DesignLevel`** — `id` (UUID str), `project_id` (FK cascade), `name` (String 60),
`position` (Integer), `background_image_key` (String 255, nullable — objet
MinIO), `show_background_public` (Boolean, défaut false), `calibration` (JSON
nullable : `{"p1": {"x","y"}, "p2": {"x","y"}, "meters": float}` — `p1`/`p2`
en coordonnées normalisées 0-1 de l'image de fond), `wall_height_m` (Numeric
4,2, défaut 2.70), `geometry` (JSON, défaut `{"walls": [], "rooms": [],
"openings": []}`), `revision` (Integer, défaut 0), `revision_author_id`
(Integer — qui a écrit la révision courante), `created_at`, `updated_at`.

**`DesignLevelShelf`** — version « mise de côté » : `id`, `level_id` (FK
cascade), `author_id`, `geometry` JSON, `calibration` JSON, `wall_height_m`,
`base_revision` (révision sur laquelle l'auteur travaillait), `created_at`,
`reviewed_at` (nullable). Une seule entrée non revue par (`level_id`,
`author_id`) : une nouvelle écriture déplacée remplace la précédente du même
auteur. C'est ce qui permet d'avertir le propriétaire et de lui laisser
récupérer le travail d'un collègue sans jamais l'écraser silencieusement.

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
| PUT | `/design3d/levels/{id}` | nom, position, `wall_height_m`, `calibration`, `geometry`, `show_background_public` — corps porte `base_revision` (révision sur laquelle le client travaillait). Règle de conflit ci-dessous. |
| GET | `/design3d/levels/{id}/shelf` | versions mises de côté non revues (propriétaire seulement) |
| POST | `/design3d/levels/{id}/shelf/{shelf_id}/dismiss` | marque revue sans récupérer |
| GET | `/design3d/sync?since=` | résumé des révisions courantes des projets du principal (id, revision, updated_at, nb de versions mises de côté) — un seul appel pour savoir quoi rafraîchir |
| DELETE | `/design3d/levels/{id}` | suppression (refusée si dernier niveau) |
| POST | `/design3d/levels/{id}/background` | upload image (PNG/JPEG ≤ 10 Mo) → MinIO, retourne l'URL signée |
| POST | `/design3d/levels/{id}/recalibrate` | nouvelle calibration + remise à l'échelle proportionnelle de la géométrie existante (serveur, pour garder une seule implémentation) |
| GET | `/public/design3d/projects/{id}` | lecture acheteur (`ready` seulement) |

Réponses JSON (`to_dict`), erreurs `{"error": msg}` (patron legacy des
services métier).

### Règle de conflit sur `PUT /design3d/levels/{id}`

Soit `R` la révision courante du serveur et `base` celle envoyée par le client.

- `base == R` → écriture acceptée, `R+1`, `revision_author_id` = principal.
- `base < R` et le principal est **le propriétaire du projet** → écriture
  acceptée quand même (le propriétaire prime), `R+1` ; la version serveur
  déplacée est **mise de côté** (`DesignLevelShelf`, auteur = ancien
  `revision_author_id`) si elle n'est pas du propriétaire lui-même. La réponse
  porte `shelved: true` pour que l'éditeur avertisse immédiatement.
- `base < R` et le principal **n'est pas** le propriétaire → **409** avec la
  version courante dans le corps ; sa version locale est mise de côté
  (`author_id` = principal) pour que le propriétaire puisse la récupérer.
  L'éditeur du collègue recharge la version serveur (son travail n'est pas
  perdu : il est sur l'étagère du propriétaire).
- Récupération par le propriétaire : l'éditeur charge une version mise de côté
  **à la place** de la géométrie courante (aperçu avant confirmation), le
  propriétaire l'ajuste à la main, puis sauvegarde normalement (nouvelle
  révision) ; l'entrée est marquée `reviewed_at`. Aucune fusion automatique.

## Hors-ligne et synchronisation (éditeur uniquement)

- **Source de vérité locale** : IndexedDB (via la petite lib `idb`, ~1 Ko),
  base `semsar-design3d`, stores `projects`, `levels`, `backgrounds` (Blob
  de l'image de fond), `outbox` (opérations en attente : `project.create`,
  `project.update`, `level.create`, `level.update`, `level.background`,
  `level.recalibrate`, `project.delete`, `level.delete`). Chaque niveau local
  garde `revision` (dernière connue du serveur) et `dirty`.
- **Édition** : toute action écrit d'abord en local (synchrone du point de vue
  de l'UI), puis empile une opération dans `outbox`. L'éditeur n'attend jamais
  le réseau.
- **Synchronisation en arrière-plan** : une boucle `useSyncEngine` tourne
  tant que l'éditeur ou le tableau de bord de conception est ouvert :
  déclenchée par `online`, `visibilitychange`, un intervalle de 30 s et
  après chaque opération locale. Elle rejoue `outbox` dans l'ordre (une
  opération à la fois, retrait après succès, backoff exponentiel plafonné à
  5 min sur erreur réseau, arrêt sur 401 jusqu'à ré-authentification —
  la file persiste). L'API **Background Sync** du navigateur n'est **pas**
  utilisée (absente sur Safari/iPad) : la synchronisation est portée par
  l'application ouverte.
- **Rafraîchissement** : `GET /design3d/sync` au démarrage et à chaque cycle ;
  un niveau dont la révision serveur a avancé et qui n'est pas `dirty`
  localement est rechargé ; s'il est `dirty`, la règle de conflit s'applique
  à la prochaine écriture. Les versions mises de côté font apparaître un
  badge « modifications d'un collègue à examiner ».
- **Image de fond hors-ligne** : stockée en Blob local dès l'upload, affichée
  depuis le Blob ; l'envoi au serveur est une opération d'`outbox` comme les
  autres.
- **Indicateur d'état** permanent dans l'éditeur : *Hors-ligne — N
  modifications en attente* / *Synchronisation…* / *Synchronisé à HH:MM* /
  *Conflit à examiner* / *Session expirée — reconnectez-vous pour
  synchroniser*.
- **PWA** : `vite-plugin-pwa` (Workbox) — précache de l'app shell et des
  routes `/dashboard/conception/*` ; `NetworkFirst` pour l'API ; manifeste
  (icône, `display: standalone`, orientation `any`). Nouvelle dépendance de
  build, à documenter (CHANGELOG, `.env.example` inchangé).
- **Session** : les cookies httpOnly ne se rafraîchissent qu'en ligne ;
  l'édition ne nécessite aucune auth, seule la synchronisation en dépend.
- **Limites assumées** : pas de fusion automatique ; l'espace IndexedDB
  peut être purgé par l'OS après une longue inactivité (Safari : ~7 jours
  sans usage) — l'indicateur incite à synchroniser dès qu'une connexion
  existe, et une purge locale n'affecte jamais ce qui a déjà été synchronisé.

## Tablette (UI tactile)

- **Cibles** : 8" (1024×768 iPad mini / Android 8"), 10-11" (1180×820 iPad,
  1280×800 Android), 13" (1366×1024 iPad Pro), en portrait et paysage. Points
  de rupture : `< 900px` de large → mode compact (barre d'outils en bas,
  panneau latéral en **bottom sheet** dépliable) ; `≥ 900px` → outils à
  gauche, panneau à droite ; `≥ 1200px` → panneau élargi avec aperçu du
  niveau.
- **Cibles tactiles** ≥ 44×44 px partout (outils, poignées de sommets,
  onglets), poignées de sélection agrandies sur `pointerType === "touch"`.
- **Gestes** : un doigt = action de l'outil courant (tracer, sélectionner,
  déplacer) ; deux doigts = déplacement + pinch-zoom du plan (calcul sur
  `PointerEvent`s multiples, `touch-action: none` sur le canevas) ; appui
  long = menu contextuel (supprimer, propriétés). Aucune fonction ne dépend du
  survol ni du clavier : undo/redo sont des boutons toujours visibles, les
  longueurs se saisissent via un **pavé numérique** intégré (pas seulement le
  clavier virtuel, qui masque la moitié de l'écran en portrait).
- **Précision** : l'accrochage (grille/extrémités) compense l'imprécision du
  doigt ; un **loupe** flottante apparaît sous le doigt pendant un tracé fin.
- **Orientation** : la disposition se recalcule à la rotation sans perdre
  l'état ; le canevas conserve le centre de vue.
- **Plein écran** : bouton « plein écran » masquant la navigation du
  backoffice ; en PWA installée c'est le mode par défaut.
- **Performance** : rendu SVG limité aux éléments visibles au-delà de 500
  segments (rare pour un plan de logement, mais un plan de villa multi-
  niveaux importé peut y arriver) ; `requestAnimationFrame` pour le drag.
- **Vérification** : tests Playwright sur les 6 viewports (3 tailles × 2
  orientations) couvrant : tracer un mur, poser une porte, ouvrir/fermer le
  bottom sheet, pinch-zoom simulé, rotation ; plus une **revue manuelle sur
  un vrai iPad et une vraie tablette Android** avant de marquer la brique
  livrée (le tactile réel ne se simule pas entièrement).

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
8. **Sauvegarde** : locale et immédiate à chaque action (IndexedDB), pas de
   bouton « enregistrer » — l'indicateur d'état montre ce qui reste à
   synchroniser. Propriétaire : avertissement « un collègue a modifié ce
   niveau » avec aperçu et bouton « Récupérer sa version » ; collègue :
   « le propriétaire a modifié ce niveau, votre version lui a été transmise »
   puis rechargement. Undo/redo par boutons (Ctrl+Z / Ctrl+Y aussi, sur
   clavier physique).
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
- Frontend : nouvelles dépendances `idb` (runtime) et `vite-plugin-pwa`
  (build) + `fake-indexeddb` (tests) — à ajouter avec leur lockfile, entrée
  CHANGELOG, et `npm audit` passé (hygiène de dépendances du projet).
- Migration : nouveau service → `create_all` au démarrage suffit ; côté
  `billing`, `db/migrate_design3d.sql` (ALTER ADD COLUMN `has_design3d`).

## Tests

**Backend** (`services/design3d/tests`, sqlite + `dependency_overrides`) :
entitlement (403 sans `design3d`) ; cloisonnement croisé agence/propriétaire ;
CRUD projets/niveaux ; création de projet crée un niveau par défaut ;
suppression du dernier niveau refusée ; `PUT /levels/{id}` incrémente
`revision` ; **règle de conflit** : propriétaire avec `base_revision` obsolète
→ accepté + version déplacée mise de côté (`shelved: true`), collègue avec
`base_revision` obsolète → 409 + sa version mise de côté, une seule entrée non
revue par auteur, `dismiss` marque revue ; `GET /sync` ne renvoie que les
projets du principal ; UUID client déjà pris par un autre propriétaire → 409 ;
chaque règle de validation de
`geometry` (mur dégénéré, ouverture hors mur, ouverture orpheline, polygone à
2 points, allège + hauteur > hauteur de mur) ; `recalibrate` remet à l'échelle
murs/pièces/ouvertures proportionnellement ; lecture publique 404 tant que
`draft`, fond masqué sauf `show_background_public`.

**Frontend** : `floorplan.test.js` (vitest) pour chaque fonction de
`utils/floorplan.js` avec cas limites (mur vertical/horizontal/diagonal,
polygone concave, point hors segment, calibration dégénérée) ;
`DesignEditor.test.jsx` rendu FR/AR (patron `PropertyForm.test.jsx`) ;
`noHardcodedText` et parité i18n. **Moteur de synchronisation**
(`syncEngine.test.js`, IndexedDB simulée par `fake-indexeddb`) : une action
écrit en local avant tout réseau ; rejeu de l'`outbox` dans l'ordre ; retrait
après succès seulement ; backoff sur erreur réseau ; arrêt sur 401 avec file
conservée ; reprise sur `online` ; création hors-ligne d'un projet puis
synchronisation sans changement d'id ; conflit propriétaire (`shelved`) et
collègue (409 → rechargement) reflétés dans l'indicateur d'état. **Tablette** :
Playwright, 6 viewports (cf. section Tablette), scénarios tactiles simulés.

## Hors périmètre (briques suivantes ou plus tard)

- Scène 3D, meubles, matériaux (brique 2) ; rendus IA (3) ; catalogue
  partenaires (4) ; add-on payant et crédits (5).
- Conversion PDF → image côté serveur (image uniquement dans un premier temps).
- Import DXF/IFC, détection automatique des pièces, sens d'ouverture des
  portes, murs courbes, escaliers.
- Collaboration temps réel et fusion automatique (la règle « le propriétaire
  prime + étagère » suffit ; à revoir si des agences travaillent réellement
  à plusieurs sur un même projet).
- Hors-ligne pour le reste du backoffice, et support stylet dédié (le stylet
  se comporte comme un doigt).
