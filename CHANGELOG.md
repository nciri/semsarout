# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Added

- Éditeur de plan 2D (design3d) — hors-ligne, PWA, tablette : logique géométrique pure
  (`frontend/src/utils/floorplan.js`) et dépendances associées (`idb`, `fake-indexeddb`,
  `vite-plugin-pwa`, `@playwright/test`).
- Service `design3d` (:8526, schéma `design3d`) : projets et niveaux de plan, géométrie
  validée, calibration et fond de plan, synchronisation hors-ligne (`/design3d/*`) et
  lecture publique des plans publiés (`/public/design3d/*`), sous la feature
  `has_design3d` projetée depuis billing jusqu'au JWT.
- Éditeur tactile et visionneuse publique côté front, avec file d'attente IndexedDB,
  installation PWA et tests Playwright sur 6 formats de tablette.

### Changed

- Limite de pré-cache PWA (2 Mio) posée explicitement dans `vite.config.js` plutôt que
  laissée au défaut du plugin : un fragment trop gros fait échouer le build.
- Découpage du bundle SemsarOut : toutes les pages sont chargées à la demande
  (`React.lazy`), le fragment d'entrée passe de 2,88 Mo à 701 ko. Le relèvement de
  `maximumFileSizeToCacheInBytes` à 5 Mio, qui n'existait que pour faire pré-cacher un
  bundle monolithique, est supprimé.
- CI : le job `frontend-semsarout` lance désormais `lint` et les tests unitaires avant
  le build, comme `frontend-m3a-l3achrane`.
- L'attente de chargement d'une page passe sous l'en-tête (les trois mises en page
  partagent `RouteOutlet`) et un bandeau signale une navigation en cours, que
  `startTransition` rendait jusqu'ici invisible.

### Fixed

- Provisionnement du service `design3d` : le rôle et le schéma PostgreSQL manquaient à
  `semsar_db_roles` alors que design3d était déjà déclaré en `mesh_apps`/`mesh_relays`,
  ce qui faisait échouer le playbook Ansible entier (indexation sans garde de
  `PG_PASSWORD_DESIGN3D`). Le gabarit du relais reçoit la même garde que celui du worker,
  et un serveur déjà provisionné se voit compléter son `secrets.env` (jamais réécrit)
  avec les seules entrées manquantes.
- La migration `billing/migrate_design3d.sql` est désormais jouée par le playbook Ansible :
  sans elle, la colonne `has_design3d` manquait en production et toute lecture des plans
  d'abonnement échouait (`UndefinedColumn`), mettant billing entièrement hors service.
- Un fragment de page qui ne se charge pas (déploiement pendant la session, coupure
  réseau) affiche un message et un bouton de rechargement au lieu d'un écran blanc :
  barrière d'erreur autour des routes + rechargement automatique du service worker
  sur `controllerchange`.
