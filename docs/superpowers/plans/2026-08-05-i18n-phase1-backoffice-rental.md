# i18n Phase 1 — Back-office sous-lot `rental/` — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Étapes en checkbox (`- [ ]`).

**Goal:** Rendre bilingues FR/AR les 9 pages du domaine gestion locative (`src/pages/backoffice/rental/`) : layout, mandats, baux, candidatures, état des lieux, décompte de caution.

**Architecture:** Même recette que les lots précédents (react-i18next, `t()`, brouillon AR MSA, Tailwind logique, `DirIcon`, garde-fou `noHardcodedText` + parité). Namespace **`backoffice`**, section **`backoffice:rental`** avec une sous-section **`shared`** (chaînes répétées : titre de page, chargement, retour, introuvable, erreur de chargement) établie en Task 1 puis réutilisée. Une tâche = une page (ou une paire liste+détail) = un commit.

**Tech Stack:** react-i18next, Vitest + @testing-library/react.

## Global Constraints

- Langues `fr`/`ar`. Namespace `backoffice` (existe déjà, `src/locales/{fr,ar}/backoffice.json`). `const { t } = useTranslation(['backoffice','common'])`, clés `t('backoffice:rental.<key>')`. Réutiliser `common:actions/errors/validation` et `backoffice:rental.shared.*` quand ça convient.
- fr/ar `backoffice.json` **structurellement identiques** (test `keyParity`). Brouillon AR MSA.
- Chaque page ajoutée à `MIGRATED_FILES`. **Le garde-fou a un angle mort** : le texte JSX adjacent à `{expr}` et les labels rendus via expressions/objets de config ne sont PAS détectés → **relire chaque fichier en entier**, ne pas se fier au garde-fou seul.
- Interpolation `{{n}}` (jamais `{{count}}`). Données API (noms, adresses, montants) restent FR. Icônes directionnelles → `DirIcon`, classes physiques → logiques. Si une branche compare une valeur à une chaîne FR, remplacer par un enum/drapeau.
- `npm test` + `npm run build` verts à chaque commit. Répertoire `frontend/`. Branche `feature/i18n-phase1-backoffice`.

---

## Recette commune (chaque tâche)
1. `const { t } = useTranslation(['backoffice','common'])`.
2. Remplacer chaque chaîne FR visible (texte, `title`, `placeholder`, `aria-label`, boutons, options, toasts, états vide/chargement/erreur, statuts) par `t('backoffice:rental.<section>.<key>')`. Réutiliser `backoffice:rental.shared.*` (Task 1) pour les chaînes communes et `common:*` si une clé existe.
3. Maps de statuts / tableaux de config de libellés → lookup de clé keyé sur l'enum stable.
4. Ajouter les clés dans `fr/backoffice.json` ET `ar/backoffice.json` (identiques). Ajouter le fichier à `MIGRATED_FILES`.
5. Test de rendu si montage simple (`MemoryRouter` + `QueryClientProvider` ; `Routes/Route` pour `:id`) sur une chaîne statique toujours rendue (état chargement/erreur/introuvable), FR≠AR, lancé d'abord (FAIL). Sinon garde-fou + parité (noter au rapport).
6. `npm test` + `npm run build` verts. Commit.

---

## Task 1: `RentalLayout.jsx` + sous-section partagée `backoffice:rental.shared`

Établir la sous-section **`backoffice:rental.shared`** dans fr+ar backoffice.json avec au moins : `pageTitle` ("Gestion locative"), `loading` ("Chargement…"), `back` ("Retour"), `notFound` ("Élément introuvable."), `loadError` ("Une erreur est survenue lors du chargement. Réessayez plus tard."). Migrer `RentalLayout.jsx` : `title="Gestion locative"` + sous-titre "Mandats de gestion, baux & quittancement, candidatures locatives" + libellés d'onglets → `backoffice:rental.shared.*` / `backoffice:rental.layout.*`.

- [ ] **Step 1:** Migrer `RentalLayout.jsx` + créer `backoffice:rental.shared` et `backoffice:rental.layout` (fr+ar) + `MIGRATED_FILES`.
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): rental RentalLayout + clés partagées (backoffice:rental)`

---

## Task 2: `MandatesList.jsx` + `MandateDetail.jsx` → `backoffice:rental.mandate`

Liste + détail des mandats de gestion. Migrer : titres, "Nouveau mandat", états vide ("Aucun mandat"), "Retour aux mandats", statuts de mandat (map par enum), colonnes/labels. Réutiliser `backoffice:rental.shared.{loading,back,notFound,loadError}`. Noms de bailleurs/biens = données FR.

- [ ] **Step 1:** (Test de rendu MandatesList si montage simple : `QueryClientProvider`+`MemoryRouter`, ancré sur `backoffice:rental.mandate.<key>` FR≠AR, lancé d'abord → FAIL.) Migrer les 2 fichiers + `backoffice:rental.mandate` (fr+ar) + `MIGRATED_FILES`.
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` (+ test si écrit) → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): rental Mandats bilingues (backoffice:rental.mandate)`

---

## Task 3: `LeasesList.jsx` + `LeaseDetail.jsx` → `backoffice:rental.lease`

Liste + détail des baux. Migrer : "Baux", "Nouveau bail", "Aucun bail", "Quittance", statuts de bail (map par enum), labels de sections (locataire, loyer, dépôt), boutons. Réutiliser `shared.*`. Montants/dates/noms = données.

- [ ] **Step 1:** Migrer les 2 fichiers + `backoffice:rental.lease` (fr+ar) + `MIGRATED_FILES` (test de rendu si faisable).
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): rental Baux bilingues (backoffice:rental.lease)`

---

## Task 4: `ApplicationsList.jsx` + `ApplicationDetail.jsx` → `backoffice:rental.application`

Liste + détail des candidatures locatives. Migrer : "Candidatures", "Présélectionné" et autres statuts (map par enum), "Déposer un dossier pour un client", placeholder "Rechercher un candidat (nom, email)…", "Valider"/actions de décision, sections du dossier (revenus, garant, pièces), états. Réutiliser `shared.*`. Données candidat = FR.

- [ ] **Step 1:** Migrer les 2 fichiers + `backoffice:rental.application` (fr+ar) + `MIGRATED_FILES` (test de rendu ApplicationsList si faisable).
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): rental Candidatures bilingues (backoffice:rental.application)`

---

## Task 5: `InventoryEditor.jsx` → `backoffice:rental.inventory`

Éditeur d'état des lieux. Migrer : "État des lieux", "Retour au bail", "Finaliser", "Cet état des lieux est finalisé et verrouillé (lecture seule).", labels de pièces/éléments/états, boutons, toasts. Réutiliser `shared.*`. Si des libellés d'état d'élément (bon/moyen/mauvais…) sont dans un tableau de config, migrer par lookup.

- [ ] **Step 1:** Migrer `InventoryEditor.jsx` + `backoffice:rental.inventory` (fr+ar) + `MIGRATED_FILES`.
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): rental État des lieux bilingue (backoffice:rental.inventory)`

---

## Task 6: `SettlementEditor.jsx` → `backoffice:rental.settlement`

Éditeur de décompte de caution. Migrer : "Décompte de caution", "Retour au bail", "Comparaison entrée ↔ sortie", "Pas d'état des lieux de sortie", labels de lignes de décompte, retenues, totaux, boutons, toasts. Réutiliser `shared.*`. Montants = données.

- [ ] **Step 1:** Migrer `SettlementEditor.jsx` + `backoffice:rental.settlement` (fr+ar) + `MIGRATED_FILES`.
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): rental Décompte de caution bilingue (backoffice:rental.settlement)`

---

## Validation finale du sous-lot rental

- [ ] `cd frontend && npm test` → tous verts (parité backoffice, garde-fou sur les 9 pages rental, tests de rendu).
- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] `MIGRATED_FILES` inclut les 9 pages `rental/` ; relecture intégrale confirmée (pas de FR résiduel adjacent à `{expr}` / dans les maps de statuts).
- [ ] Reste back-office : `shop/`+`artisans/`, `contracts/`+`legal/`, `analytics/`, CRM cœur (petit puis gros), `Settings`/`StripeConfig`, finitions `Dashboard`/`BackofficeLayout`.
