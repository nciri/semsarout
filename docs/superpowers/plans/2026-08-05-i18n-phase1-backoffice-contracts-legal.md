# Plan — i18n Phase 1 · sous-lot back-office `contracts/` + `legal/`

Branche : `feature/i18n-phase1-bo-contracts` (depuis `develop` à jour, PR #20 shop+artisans mergée).
Namespaces : `backoffice:contracts` (+ `contracts.shared/status/docType`) et `backoffice:legal` (+ `legal.shared`).
Recette : cf. mémoire `i18n-arabe-chantier` — `useTranslation(['backoffice','common'])`, maps de statut
= `STATUS_TONE` (className) + `t('...status.<enum>', {defaultValue})` keyé enum, toast erreur
= `common:errors.short`, actions génériques locales par domaine, parité fr/ar, ajout à `MIGRATED_FILES`,
**relecture intégrale** de chaque fichier (angle mort du garde-fou), brouillon AR (MSA) immédiat.

## Périmètre — 8 fichiers

- `contracts/ContractsList.jsx`, `contracts/ContractEditor.jsx`, `contracts/ContractCreate.jsx`, `contracts/TemplatesManager.jsx`
- `legal/NotairesLayout.jsx`, `legal/NotariesDirectory.jsx`, `legal/LegalCasesList.jsx`, `legal/LegalCaseDetail.jsx`

## Tâches (1 commit chacune)

1. **contracts socle + Liste + Éditeur** — établir `contracts.{shared,status,docType,list,editor}` (fr+ar).
   Migrer `ContractsList` (STATUS map draft/finalized/signed → tone + label keyé) et `ContractEditor`
   (statut, boutons save/finalize/downloadPdf/markSigned, toasts, `locked` interpolé `{{status}}`).
2. **contracts Nouveau + Modèles** — `contracts.{create,templates}`. Migrer `ContractCreate`
   (sections/champs/placeholders/aperçu, `docType` réutilisé) et `TemplatesManager` (gated, formulaire,
   champs de fusion, toasts).
3. **legal socle + Notaires** — `legal.{shared,layout,notaries}`. Migrer `NotairesLayout` (onglets) et
   `NotariesDirectory` (jumeau d'`artisans.directory` : colonnes, actions, modal, champs, toasts).
4. **legal Dossiers** — `legal.{cases,caseDetail}`. Migrer `LegalCasesList` (STATUS_TONE + `shared.status`,
   `shared.caseType`, avertissement no-notaire via `<Trans>` avec lien) et `LegalCaseDetail`
   (statut/notaire selects, étapes, toasts).

## Garde-fous par tâche

- Ajouter chaque fichier à `MIGRATED_FILES` (`src/i18n/noHardcodedText.test.js`).
- `npm test -- keyParity noHardcodedText` + test de rendu ciblé par domaine ; build vert en fin de sous-lot.
- Devises `Đh` et données API restent inchangées.
