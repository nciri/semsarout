# i18n Phase 1 — Lot composants partagés — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Étapes en checkbox (`- [ ]`).

**Goal:** Rendre bilingues FR/AR les composants React partagés qui contiennent du texte visible (chrome de navigation, cartes de biens, recherche, widgets de visite/prix, bannières, composants back-office).

**Architecture:** Même recette que les lots publics (react-i18next, `t()`, brouillon AR MSA, Tailwind logique, `DirIcon`, garde-fou `noHardcodedText` + parité). Les composants **partagés** (layout, cartes, recherche, widgets) utilisent le namespace **`common`** ; les composants **back-office** utilisent **`backoffice`**. Une tâche = un composant (ou un petit groupe cohérent) = un commit.

**Tech Stack:** react-i18next, Vitest + @testing-library/react.

## Global Constraints

- Langues : `fr` (défaut+fallback) et `ar`. Namespaces : **`common`** pour le chrome partagé (nouvelles sections), **`backoffice`** pour les composants back-office. Réutiliser les clés existantes (`common:actions.*`, `common:errors.*`, `common:validation.*`) quand elles conviennent.
- `useTranslation(['common'])` (ou `['backoffice','common']` pour les composants BO). Clés `t('common:<section>.<key>')`.
- fr/ar de CHAQUE namespace touché **structurellement identiques** (le test `keyParity` couvre common ET backoffice). Brouillon AR = MSA formel.
- Chaque composant migré est ajouté à `MIGRATED_FILES` dans `src/i18n/noHardcodedText.test.js`. Le garde-fou est **statique** (lit la source) : il attrape les oublis SANS rendu — c'est le filet principal pour les composants difficiles à monter isolément.
- **Test de rendu** : en écrire un (FR→AR) quand le composant se monte à faible coût (props simples, providers légers). Pour un composant nécessitant un contexte lourd (auth, react-query, params), s'appuyer sur garde-fou + parité + build (pas de test de rendu obligatoire) — le noter dans le rapport.
- Interpolation `{{n}}` (jamais `{{count}}`). Données API/props (titres de biens, noms) restent FR. Icônes directionnelles → `DirIcon` ; classes physiques → logiques.
- Ne PAS migrer les chaînes d'attribution des cartes (Leaflet/OSM) ni le code non affiché. Ne PAS réintroduire i18next-parser.
- `npm test` + `npm run build` verts à chaque commit. Répertoire : `frontend/`. Branche : `feature/i18n-phase1-components`.

---

## File Structure

Par tâche : Modify le(s) `src/components/**/<Comp>.jsx` + `src/locales/{fr,ar}/<ns>.json` (nouvelle section) + `src/i18n/noHardcodedText.test.js` (`MIGRATED_FILES`) ; Create un `<Comp>.test.jsx` si montage simple.

Inventaire (namespace → composants) :
- `common:nav` → `layout/Header.jsx` (gros objet de config de libellés de nav + méga-menu dashboard + nav publique).
- `common:footer` → `layout/Footer.jsx` ; `common:impersonation` → `admin/ImpersonationBanner.jsx`.
- `common:propertyCard` → `common/PropertyCard.jsx`.
- `common:advancedSearch` → `search/AdvancedSearch.jsx`.
- `common:search` → `common/SearchForm.jsx`, `common/SearchableSelect.jsx`, `search/MultiSelectDropdown.jsx`.
- `common:visit` → `common/BookVisitWidget.jsx` ; `common:lotPlan` → `common/LotPlanViewer.jsx`.
- `common:priceGauge` → `common/PriceGauge.jsx` ; `common:lightbox` → `common/PhotoLightbox.jsx` ; `common:widgets` → `dashboard/widgets/index.jsx`.
- `backoffice:signature` → `backoffice/SignaturePanel.jsx` ; `backoffice:ui` → `backoffice/ui.jsx`.

---

## Recette commune (chaque tâche)

1. `import { useTranslation } from 'react-i18next'` ; `const { t } = useTranslation(['common'])` (ou `['backoffice','common']`).
2. Remplacer chaque chaîne FR visible (texte JSX, `placeholder`, `title`, `aria-label`, boutons, options, toasts, messages) par `t('<ns>:<section>.<key>')`. Réutiliser `common:actions/errors/validation` quand une clé existe déjà.
3. Ajouter chaque nouvelle clé dans `fr/<ns>.json` ET `ar/<ns>.json` (structurellement identiques ; FR verbatim / brouillon AR MSA), sans toucher aux sections existantes.
4. Config arrays de libellés (types de bien, statuts, titres de widgets) → migrer par lookup de clé (comme lots publics), sans restructurer le rendu. Si une branche compare une valeur à une chaîne FR, remplacer par un drapeau/enum.
5. RTL : classes physiques → logiques ; icônes directionnelles → `DirIcon`.
6. Ajouter le fichier à `MIGRATED_FILES`. `npm test` + `npm run build` verts. Commit.

**Cycle par tâche :** (test de rendu si faisable → échoue) → migrer + `MIGRATED_FILES` → (test passe) → `npm test && npm run build` verts → commit.

---

## Task 1: `layout/Header.jsx` → `common:nav`

Gros composant de navigation : objet(s) de config de libellés (méga-menu dashboard : « Activité », « Tour de contrôle »/« Mon espace », « Mes annonces », « Mes candidatures », « Demandes / Leads », « Recherche », « Mes recherches », « Mes messages », « Gestion de l'agence », « Relation client », « Messagerie », « Disponibilités », « Location courte durée », « StayManager », « Administration », « Prix de référence », « Super-admin », « Plateforme », « Mon compte ») + nav publique (Accueil, Annonces, Programmes, Agences, Nos services, Vendre, Connexion/Inscription/Déconnexion) + `aria-label="Menu utilisateur"`. Migrer tous ces libellés en `common:nav.*` via lookup de clé sur les objets de config (ne pas restructurer la logique de menu). Réutiliser `common:language.*` si pertinent.

Contexte lourd (auth/router) → **pas de test de rendu obligatoire** ; s'appuyer sur garde-fou statique + parité + build. Ajouter `'src/components/layout/Header.jsx'` à `MIGRATED_FILES`.

- [ ] **Step 1:** Migrer `Header.jsx` (recette, lookup de clé sur les objets de nav) + `MIGRATED_FILES` + sections `common:nav` dans fr/ar.
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS (garde-fou + parité).
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `git add src/components/layout/Header.jsx src/i18n/noHardcodedText.test.js src/locales/fr/common.json src/locales/ar/common.json && git commit -m "feat(i18n): Header bilingue (common:nav)"`

---

## Task 2: `layout/Footer.jsx` (`common:footer`) + `admin/ImpersonationBanner.jsx` (`common:impersonation`)

Footer : liens de navigation, colonnes, mentions, réseaux sociaux (`title="… (bientôt disponible)"`, `"Bientôt disponible"`), copyright. ImpersonationBanner : « Connecté en tant que … (impersonation) », bouton « Quitter ».

Footer se monte simplement (`MemoryRouter`) → **écrire un test de rendu** ancré sur un libellé statique `common:footer.<key>` (FR→AR). ImpersonationBanner : monté conditionnellement (état d'impersonation) → garde-fou + parité suffisent.

- [ ] **Step 1: Test de rendu Footer** — Create `src/components/layout/Footer.test.jsx` (MemoryRouter, FR puis AR sur `common:footer.<key>`). Lancer → FAIL.
- [ ] **Step 2:** Migrer `Footer.jsx` + `ImpersonationBanner.jsx` (recette) + les 2 fichiers dans `MIGRATED_FILES` + sections `common:footer` / `common:impersonation` fr/ar.
- [ ] **Step 3:** `cd frontend && npm test -- Footer noHardcodedText keyParity` → PASS.
- [ ] **Step 4:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 5: Commit** — `feat(i18n): Footer + ImpersonationBanner bilingues (common:footer/impersonation)`

---

## Task 3: `common/PropertyCard.jsx` → `common:propertyCard`

Carte de bien (rendue partout) : toasts favoris (« Ajouté aux favoris »/« Retiré des favoris », « Connectez-vous pour ajouter aux favoris »), erreur générique (réutiliser `common:errors.generic`), badges « Urgent »/« Premium », labels transaction « Vente »/« Location ». Titre/prix/ville du bien = données FR.

Se monte avec une prop `property` mock + `MemoryRouter` (+ `QueryClientProvider` si mutation favoris) → **test de rendu** ancré sur un badge/label statique.

- [ ] **Step 1: Test de rendu** — Create `src/components/common/PropertyCard.test.jsx` (providers requis, prop `property` minimale, FR→AR sur `common:propertyCard.<key>`). Lancer → FAIL.
- [ ] **Step 2:** Migrer `PropertyCard.jsx` (recette, réutiliser `common:errors.generic`) + `MIGRATED_FILES` + section `common:propertyCard` fr/ar.
- [ ] **Step 3:** `cd frontend && npm test -- PropertyCard noHardcodedText keyParity` → PASS.
- [ ] **Step 4:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 5: Commit** — `feat(i18n): PropertyCard bilingue (common:propertyCard)`

---

## Task 4: `search/AdvancedSearch.jsx` → `common:advancedSearch`

Le plus gros composant du lot (~22 chaînes) : libellés de filtres (type de bien, transaction, prix min/max, surface, chambres, ville/quartier), placeholders, boutons (Rechercher/Réinitialiser → réutiliser `common:actions.*` si présents), options de `<select>`, titres de sections. Migrer les tableaux d'options par lookup de clé.

Contexte (router/params) → test de rendu si faisable (`MemoryRouter` + `QueryClientProvider`), sinon garde-fou + parité.

- [ ] **Step 1:** (Optionnel) Test de rendu si montage simple. Migrer `AdvancedSearch.jsx` (recette) + `MIGRATED_FILES` + section `common:advancedSearch` fr/ar.
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): AdvancedSearch bilingue (common:advancedSearch)`

---

## Task 5: helpers de recherche → `common:search`

`common/SearchForm.jsx` (options types de bien : Tous types/Appartement/Maison/Villa/Terrain/Local commercial/Bureau ; villes), `common/SearchableSelect.jsx` (placeholders « Sélectionner… », « Rechercher… », « Aucun résultat »), `search/MultiSelectDropdown.jsx` (placeholders/libellés éventuels — inspecter). Migrer les listes d'options par lookup ; les noms de villes marocaines (données) peuvent rester FR (noms propres) — migrer seulement les libellés d'UI (« Toutes les villes », placeholders).

SearchableSelect se monte simplement → **test de rendu** sur un placeholder. Les autres : garde-fou + parité.

- [ ] **Step 1: Test de rendu SearchableSelect** — Create `src/components/common/SearchableSelect.test.jsx` (props minimales, FR→AR sur `common:search.<key>`). Lancer → FAIL.
- [ ] **Step 2:** Migrer les 3 fichiers (recette) + `MIGRATED_FILES` + section `common:search` fr/ar.
- [ ] **Step 3:** `cd frontend && npm test -- SearchableSelect noHardcodedText keyParity` → PASS.
- [ ] **Step 4:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 5: Commit** — `feat(i18n): helpers de recherche bilingues (common:search)`

---

## Task 6: widgets biens → `common:visit` + `common:lotPlan`

`common/BookVisitWidget.jsx` (réservation de visite : « Visite confirmée », « Chargement des créneaux… », toasts « Visite réservée ! »/« Erreur lors de la réservation », boutons « Réservation… »/« Confirmer la visite »/« Se connecter pour réserver ») → `common:visit`. `common/LotPlanViewer.jsx` (plan des lots public : « Effacer », « Demander des infos », « Demande d'information », labels formulaire « Votre nom * »/« Téléphone * », validation « Nom et téléphone requis » → réutiliser `common:validation.*` si adéquat, toast « Erreur lors de l'envoi » → `common:errors.generic`) → `common:lotPlan`.

Contexte (react-query/mutations) → garde-fou + parité ; test de rendu si faisable.

- [ ] **Step 1:** Migrer `BookVisitWidget.jsx` + `LotPlanViewer.jsx` (recette) + `MIGRATED_FILES` + sections `common:visit`/`common:lotPlan` fr/ar.
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): BookVisitWidget + LotPlanViewer bilingues (common:visit/lotPlan)`

---

## Task 7: affichage divers → `common:priceGauge` + `common:lightbox` + `common:widgets`

`common/PriceGauge.jsx` (« Prix de référence du quartier », « Dans la moyenne du quartier », « au-dessus »/« en-dessous », « pour ce bien », l'infobulle explicative longue, unités « Dh/m² »/« Dh/m²/mois ») → `common:priceGauge`. `common/PhotoLightbox.jsx` (aria-labels « Fermer (Échap) », « Réduire »/« Agrandir », « Image précédente (←) »/« Image suivante (→) ») → `common:lightbox`. `dashboard/widgets/index.jsx` (titres de widgets : Finance, Pipeline, Leads, Annonces, Marché, Abonnement, Alertes ; « voir plus → ») → `common:widgets`.

PriceGauge et PhotoLightbox se montent avec props simples → **test de rendu** sur l'un des deux.

- [ ] **Step 1: Test de rendu PriceGauge** — Create `src/components/common/PriceGauge.test.jsx` (props numériques minimales, FR→AR sur `common:priceGauge.<key>`). Lancer → FAIL.
- [ ] **Step 2:** Migrer les 3 fichiers (recette ; l'infobulle PriceGauge est un `title=` long → une clé unique) + `MIGRATED_FILES` + sections fr/ar.
- [ ] **Step 3:** `cd frontend && npm test -- PriceGauge noHardcodedText keyParity` → PASS.
- [ ] **Step 4:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 5: Commit** — `feat(i18n): PriceGauge + PhotoLightbox + widgets dashboard bilingues (common:priceGauge/lightbox/widgets)`

---

## Task 8: composants back-office → `backoffice:signature` + `backoffice:ui`

`backoffice/SignaturePanel.jsx` (libellés de statut de signature : En attente, Envoyé en signature, Signature en cours, Signé, Refusé, Annulé, Expiré ; « PDF indisponible » — migrer le map de statuts par lookup de clé) → `backoffice:signature`. `backoffice/ui.jsx` (placeholder « Rechercher… » — réutiliser `common:actions.search` si dispo, sinon `backoffice:ui.searchPlaceholder`) → `backoffice:ui`.

`useTranslation(['backoffice','common'])`. Contexte BO → garde-fou + parité.

- [ ] **Step 1:** Migrer `SignaturePanel.jsx` + `backoffice/ui.jsx` (recette) + `MIGRATED_FILES` + sections `backoffice:signature`/`backoffice:ui` fr/ar.
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): SignaturePanel + backoffice/ui bilingues (backoffice:signature/ui)`

---

## Validation finale du lot composants

- [ ] `cd frontend && npm test` → tous verts (parité common + backoffice, garde-fou sur tous les composants ajoutés, tests de rendu).
- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] `MIGRATED_FILES` inclut les composants migrés ; le garde-fou ne signale rien.
- [ ] **Composants à texte dynamique/nul (CompareBar, MesBiensTabs, MessageThread, map/*, analytics/*, DirhamIcon)** : vérifier au passage s'ils portent du texte FR visible ; si oui et hors périmètre des 8 tâches, le noter au ledger comme reste (sweep ultérieur) ; sinon rien à faire.
- [ ] Manuel : `npm run dev`, bascule FR↔AR sur l'en-tête, le pied de page, une carte de bien, la recherche avancée → RTL correct.
