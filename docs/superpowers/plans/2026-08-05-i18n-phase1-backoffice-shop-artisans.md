# i18n Phase 1 — Back-office sous-lot `shop/` + `artisans/` — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Étapes en checkbox (`- [ ]`).

**Goal:** Rendre bilingues FR/AR les 9 pages de la boutique (`shop/`, 5 pages) et de l'annuaire artisans / ordres de travaux (`artisans/`, 4 pages).

**Architecture:** Recette établie (react-i18next, `t()`, brouillon AR MSA, Tailwind logique, `DirIcon`, garde-fou `noHardcodedText` + parité). Namespaces **`backoffice:shop`** et **`backoffice:artisans`**, chacun avec une sous-section **`shared`** (pageTitle/loading/back/notFound/loadError) établie dans sa première tâche puis réutilisée. Maps de statut → `STATUS_TONE` (className) + `t('...status.<enum>', {defaultValue})` keyé sur l'enum. Une tâche = 1-2 pages = un commit.

**Tech Stack:** react-i18next, Vitest + @testing-library/react.

## Global Constraints

- Langues `fr`/`ar`. Namespace `backoffice` (existe). `const { t } = useTranslation(['backoffice','common'])`, clés `t('backoffice:shop.<key>')` / `t('backoffice:artisans.<key>')`. Réutiliser `common:actions/errors/validation` et la sous-section `shared` du namespace concerné.
- fr/ar `backoffice.json` **structurellement identiques** (keyParity). Brouillon AR MSA.
- Chaque page ajoutée à `MIGRATED_FILES`. **Garde-fou aveugle** au texte adjacent à `{expr}` / labels via maps/expressions / modules partagés → **relire chaque fichier en entier**. Si une page importe des labels FR d'un module partagé et les REND, les traduire localement via `t()` (sans toucher le module partagé).
- Interpolation `{{n}}` (jamais `{{count}}`). Données API (noms d'artisans, produits, montants, dates) restent FR. Icônes directionnelles → `DirIcon`, classes physiques → logiques. Comparaison sur enum, jamais sur texte traduit.
- `npm test` + `npm run build` verts à chaque commit. Répertoire `frontend/`. Branche `feature/i18n-phase1-bo-shop`.

## Recette commune (chaque tâche)
1. `const { t } = useTranslation(['backoffice','common'])`.
2. Remplacer chaque chaîne FR visible (texte, `title`, `placeholder`, `aria-label`, boutons, options, toasts, états vide/chargement/erreur, statuts) par `t()`. Réutiliser `<ns>.shared.*` et `common:*`.
3. Maps de statut/type → lookup de clé keyé sur l'enum stable (`STATUS_TONE` className séparé).
4. Ajouter les clés dans `fr/backoffice.json` ET `ar/backoffice.json` (identiques). Ajouter le fichier à `MIGRATED_FILES`.
5. Test de rendu si montage simple (`QueryClientProvider`+`MemoryRouter` ; `Routes/Route` pour `:id`) ancré sur une chaîne statique toujours rendue (état chargement/erreur), FR≠AR, lancé d'abord (FAIL). Sinon garde-fou + parité (noter au rapport).
6. `npm test` + `npm run build` verts. Commit.

---

## Task 1: `shop/ShopCatalog.jsx` + sous-section partagée `backoffice:shop.shared`

Établir **`backoffice:shop.shared`** (fr+ar) : `pageTitle` ("Boutique" ou le titre réel — VÉRIFIER dans le fichier), `loading` ("Chargement…"), `back` ("Retour"), `notFound` ("Élément introuvable." ou équivalent réel), `loadError` ("Une erreur est survenue lors du chargement. Réessayez plus tard." ou équivalent réel). Migrer `ShopCatalog.jsx` (24 chaînes) : titre, catégories/filtres, recherche (placeholder), cartes produits (labels statiques, prix = données), états vide/chargement/erreur, boutons "Ajouter au panier" etc.

- [ ] **Step 1:** Migrer `ShopCatalog.jsx` + créer `backoffice:shop.shared` + `backoffice:shop.catalog` (fr+ar) + `MIGRATED_FILES`. (Test de rendu si faisable, ancré sur `shop.shared`/`catalog` FR≠AR.)
- [ ] **Step 2:** `cd frontend && npm test -- ShopCatalog noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): shop Catalogue + clés partagées (backoffice:shop)`

---

## Task 2: `shop/ProductDetail.jsx` + `shop/Cart.jsx` → `backoffice:shop.product` / `backoffice:shop.cart`

Détail produit (fiche, description statique, options, bouton ajouter au panier, quantité) + panier (lignes, sous-total/total labels, TVA, "Passer commande", états vide "Votre panier est vide", boutons). Réutiliser `shop.shared.*`, `common:*`. Prix/noms produits = données.

- [ ] **Step 1:** Migrer les 2 fichiers + `backoffice:shop.product` + `backoffice:shop.cart` (fr+ar) + `MIGRATED_FILES`. (Test de rendu Cart si faisable, ancré sur un libellé statique.)
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): shop Produit + Panier bilingues (backoffice:shop.product/cart)`

---

## Task 3: `shop/OrdersList.jsx` + `shop/OrderDetail.jsx` → `backoffice:shop.order`

Liste + détail des commandes. Migrer : titre, colonnes/labels, STATUT de commande (map par enum → `t('backoffice:shop.order.status.<enum>')`, `STATUS_TONE` séparé), états vide/erreur, "Retour aux commandes", sections récap, boutons. Réutiliser `shop.shared.*`. Montants/dates/références = données.

- [ ] **Step 1:** Migrer les 2 fichiers + `backoffice:shop.order` (fr+ar, avec sous-map `status`) + `MIGRATED_FILES`. (Test de rendu OrdersList si faisable.)
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): shop Commandes bilingues (backoffice:shop.order)`

---

## Task 4: `artisans/ArtisansLayout.jsx` + `artisans/ArtisansDirectory.jsx` → `backoffice:artisans` (+ `shared`)

Établir **`backoffice:artisans.shared`** (fr+ar) : `pageTitle` (titre réel), `loading`, `back`, `notFound`, `loadError`. Migrer `ArtisansLayout.jsx` (titre + onglets) puis `ArtisansDirectory.jsx` (29 chaînes, la plus grosse) : titre, filtres (métier/spécialité — si options en tableau, lookup de clé), recherche (placeholder), cartes artisan (labels statiques ; noms/coordonnées = données), notation/labels, états, boutons. Réutiliser `common:*`.

- [ ] **Step 1:** Migrer les 2 fichiers + `backoffice:artisans.shared` + `backoffice:artisans.layout` + `backoffice:artisans.directory` (fr+ar) + `MIGRATED_FILES`. (Test de rendu ArtisansDirectory si faisable, ancré sur `artisans.shared`/`directory` FR≠AR.)
- [ ] **Step 2:** `cd frontend && npm test -- ArtisansDirectory noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): artisans Annuaire + clés partagées (backoffice:artisans)`

---

## Task 5: `artisans/WorkOrdersList.jsx` + `artisans/WorkOrderDetail.jsx` → `backoffice:artisans.workOrder`

Liste + détail des ordres de travaux. Migrer : titre, colonnes/labels, STATUT d'ordre (map par enum → `t('backoffice:artisans.workOrder.status.<enum>')`, `STATUS_TONE` séparé), priorité (si enum, lookup), "Retour aux ordres", sections (intervention, artisan assigné, coûts), boutons/actions, toasts, états. Réutiliser `artisans.shared.*`, `common:*`. Descriptions/noms/montants = données.

- [ ] **Step 1:** Migrer les 2 fichiers + `backoffice:artisans.workOrder` (fr+ar, sous-maps status/priority) + `MIGRATED_FILES`. (Test de rendu WorkOrdersList si faisable.)
- [ ] **Step 2:** `cd frontend && npm test -- noHardcodedText keyParity` → PASS.
- [ ] **Step 3:** `cd frontend && npm test && npm run build` → verts.
- [ ] **Step 4: Commit** — `feat(i18n): artisans Ordres de travaux bilingues (backoffice:artisans.workOrder)`

---

## Validation finale du sous-lot shop/artisans

- [ ] `cd frontend && npm test` → tous verts (parité backoffice, garde-fou sur les 9 pages, tests de rendu).
- [ ] `cd frontend && npm run build` → `✓ built`.
- [ ] `MIGRATED_FILES` inclut les 9 pages ; relecture intégrale confirmée (pas de FR résiduel adjacent à `{expr}` / dans les maps de statut / modules partagés rendus).
- [ ] Reste back-office : `contracts/`+`legal/`, `analytics/`, CRM cœur (petit puis gros), `Settings`/`StripeConfig`, finitions `Dashboard`/`BackofficeLayout`.
