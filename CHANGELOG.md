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

- Découpage du bundle SemsarOut : toutes les pages sont chargées à la demande
  (`React.lazy`), le fragment d'entrée passe de 2,88 Mo à 698 ko. Le relèvement de
  `maximumFileSizeToCacheInBytes` à 5 Mio, qui n'existait que pour faire pré-cacher un
  bundle monolithique, est supprimé.
- CI : le job `frontend-semsarout` lance désormais `lint` et les tests unitaires avant
  le build, comme `frontend-m3a-l3achrane`.
