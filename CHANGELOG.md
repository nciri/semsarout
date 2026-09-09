# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Added

- `GET /internal/program-lots/{id}/owner` (programs) et `agency_id` dans
  `GET /internal/properties/{id}/owner` (listing) : résolution de l'autorité sur la cible
  d'un projet de conception. Le service `programs` entre au passage dans la matrice CI.
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

- Un projet de conception ne peut plus viser un bien ou un lot hors du périmètre de son
  auteur : la propriété de la cible est vérifiée à la création auprès du service qui en
  fait autorité (`listing`, `programs`), et la création est refusée si celui-ci ne répond
  pas. Sans ce contrôle, un abonné pouvait publier son plan sur la fiche publique du bien
  d'une autre agence, qui n'avait aucun moyen de l'en retirer.
- Le plan dessiné sur le niveau initial (« RDC ») d'un projet de conception atteint enfin le
  serveur : le client tirait pour ce niveau un identifiant que le serveur, seul auteur du
  niveau initial, n'a jamais connu — chaque enregistrement partait en 404 et le travail
  restait prisonnier du navigateur, invisible et impubliable. Le projet n'affiche plus non
  plus deux onglets « RDC » après le premier rafraîchissement de fond.
- `DESIGN3D_URL` est désormais diffusée en production : sans elle le BFF répondait 404 à
  tout `/api/v1/design3d/*` et `/api/v1/public/design3d/*`, rendant l'éditeur et la
  visionneuse muets. Les URLs inter-services ont une source unique
  (`semsar_service_urls`), la variable est documentée dans `gateway/.env.example`, et le
  healthcheck de déploiement traverse désormais le BFF jusqu'à design3d.
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
