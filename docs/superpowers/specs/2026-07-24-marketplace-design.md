# Spec — Marketplace meubles & électroménager (hôtes)

**Date :** 2026-07-24
**Brique :** 7 / 8 (dernière) de la refonte
**Statut :** validé, prêt pour le plan d'implémentation
**Dépend de :** brique 1 (super-admin `/admin`), infra paiement simulée existante (`payments.py`).

---

## 1. Contexte & problème

Aucun modèle e-commerce n'existe (pas de `Product`/`Cart`/`Order`). L'infra de paiement en place
est **simulée** (`payments.py:130` → « mock payment URL ») et sert l'abonnement. La brique 7 ajoute
un **marketplace** de meubles & électroménager **dédié aux hôtes** (agences en location courte/longue
durée) : catalogue plateforme géré par le super-admin, vitrine + panier + commandes côté agence,
paiement via la passerelle simulée.

## 2. Décisions validées
| Sujet | Décision |
|-------|----------|
| Vendeur | **Catalogue plateforme unique** (pas d'agency_id), géré par le **super-admin** |
| Paiement | **Passerelle simulée existante** (mock) — statut `pending`→`paid` |
| Acheteurs | **Toute agence connectée** (hôte) — pas de gating par plan |
| Commandes | **Panier + commande + suivi de statut** |
| Emplacement vitrine | Section **« Boutique »** dans le backoffice |
| Décrément stock | **Au paiement** (vérifié au checkout, décrémenté au passage `paid`) |

## 3. Catégories (constante backend)
`backend/app/services/product_categories.py` : `PRODUCT_CATEGORIES = [{'id','label','group'}]`,
`group ∈ {furniture, appliance}`. Ex. **furniture** : lit, canapé, table, armoire, chaise, bureau ;
**appliance** : réfrigérateur, lave-linge, four, micro-ondes, climatiseur, télévision. Helpers
`is_valid_category(id) -> bool`, `group_of(id) -> str|None`.

## 4. Modèle de données (`backend/app/models/shop.py`)

### 4.1 `Product` (catalogue plateforme)
`id`, `category` (id validé), `group` (furniture/appliance, dérivé), `name`, `description`, `price`
(Numeric(12,2)), `stock` (Integer, défaut 0), `image_url`, `is_active` (Boolean défaut True),
`created_by` (FK users nullable), `created_at`, `updated_at`. `to_dict()`.

### 4.2 `Cart` / `CartItem`
- `Cart` : `id`, `user_id` (FK, unique — un panier par acheteur), `created_at`.
- `CartItem` : `id`, `cart_id` (FK, index), `product_id` (FK), `quantity` (Integer ≥ 1). `to_dict()`
  inclut un résumé produit (nom/prix/image/stock) et `line_total`.

### 4.3 `Order` / `OrderItem`
- `Order` : `id`, `reference` (unique, ex. `CMD-XXXXXX`), `agency_id` (FK, index), `buyer_id` (FK),
  `property_id` (FK nullable — bien de livraison), `delivery_address` (Text, snapshot), `status`
  (`pending`/`paid`/`preparing`/`shipped`/`delivered`/`cancelled`, défaut `pending`), `subtotal`,
  `total` (Numeric), `payment_reference` (nullable), `paid_at` (nullable), `created_at`, `updated_at`.
  `to_dict(include_items=False)` inclut `items_count` ; avec items → la liste.
- `OrderItem` : `id`, `order_id` (FK, index), `product_id` (FK nullable), `product_name`,
  `unit_price` (Numeric, **snapshot**), `quantity`, `line_total` (Numeric). `to_dict()`.

### 4.4 Migration
`add_marketplace` : tables `products`, `carts`, `cart_items`, `orders`, `order_items`.
`down_revision` = tête courante. Rétro-compatible.

## 5. Accès & règles
- Vitrine : `require_auth` ; les routes panier/commandes exigent une agence (`g.agency_id`) — un
  utilisateur sans agence → `403`.
- **Isolation** : le panier est cloisonné par **acheteur** (`user_id`) ; les commandes par **agence**
  (`agency_id`). Une agence ne voit que ses commandes ; le super-admin voit tout.
- Catalogue : **CRUD réservé au super-admin** (`/admin`, `require_superadmin`). Les agences ne voient
  que les produits `is_active=True`.
- **Stock** : vérifié au checkout (`>= quantity` pour chaque ligne, sinon `400` en nommant le produit) ;
  **décrémenté au paiement** (re-vérifié — si insuffisant entre-temps → `409`).
- **Snapshots** : `OrderItem.product_name`/`unit_price` figés à la commande ; le `total` ne change pas
  si le produit est modifié/supprimé ensuite (`product_id` nullable pour tolérer une suppression).

## 6. API

### 6.1 Vitrine — `backend/app/api/v1/backoffice/shop.py` (`require_auth`)
- `GET /shop/categories` → constante des catégories.
- `GET /shop/products?group=&category=&q=` → produits **actifs** (filtres) ; `GET /shop/products/:id`.
- Panier : `GET /shop/cart` (crée à la volée si absent) · `POST /shop/cart/items {product_id, quantity}`
  (fusionne si le produit y est déjà) · `PUT /shop/cart/items/:id {quantity}` · `DELETE /shop/cart/items/:id`.
- `POST /shop/orders {property_id?, delivery_address?}` → **checkout** : panier non vide, stock OK,
  snapshot des lignes, `subtotal`/`total`, `delivery_address` dérivée du bien (si `property_id`, validé
  agence) ou du body ; crée l'`Order` (`pending`) + `OrderItem`, **vide le panier**.
- `POST /shop/orders/:id/pay` → paiement simulé : re-vérifie le stock, **décrémente**, `status='paid'`,
  `paid_at`, `payment_reference` généré (agency-scoped ; `409` si déjà payée / stock insuffisant).
- `GET /shop/orders?status=` (agence) · `GET /shop/orders/:id` (agence).

### 6.2 Super-admin — `backend/app/api/v1/admin/shop.py` (`require_superadmin`)
- Produits : `GET /admin/products?group=&q=` · `POST` (category validée, group dérivé) ·
  `PUT/DELETE /admin/products/:id`.
- Commandes : `GET /admin/orders?status=` (toutes) · `GET /admin/orders/:id` ·
  `PUT /admin/orders/:id {status}` (préparation/expédiée/livrée/annulée…).

## 7. Front

### 7.1 Boutique (backoffice — `require_auth`)
- `ShopCatalog` (`frontend/src/pages/backoffice/shop/`) : grille de produits (image, prix, catégorie),
  filtres groupe/catégorie/recherche, bouton « Ajouter au panier ». Badge du panier (nb d'articles).
- `ProductDetail` : fiche produit + quantité + ajouter au panier.
- `Cart` : lignes (quantité éditable, retirer), total, bouton « Commander » → checkout (choix d'un bien
  de livraison OU adresse libre) → crée la commande → redirige vers le paiement.
- `OrdersList` + `OrderDetail` : mes commandes (référence, total, statut) + détail (lignes snapshot,
  bouton « Payer » si `pending`, suivi de statut).
- Entrées de menu backoffice « Boutique » + « Mes commandes ».
- `shopService.js`.

### 7.2 Super-admin (`/admin`)
- `AdminProducts` : CRUD du catalogue (nom, catégorie, prix, stock, image, actif).
- `AdminOrders` : liste de toutes les commandes + changement de statut.
- Ajoutés au menu super-admin (brique 1) ; `adminShopService` (ou `shopService` étendu).

## 8. Seed
- Quelques **produits** de démo actifs (meubles + électroménager, prix/stock variés). Catalogue
  plateforme (`created_by` = super-admin ou null). Catégories = constante de code.

## 9. Tests (avant « terminé »)
**Backend (scripts Python)** :
- catalogue : super-admin CRUD produits ; `POST` catégorie invalide → `400` ; une agence ne peut PAS
  créer/modifier un produit (routes admin → `403`/`401`) ; la vitrine ne renvoie que les `is_active`.
- panier : ajout (fusion des quantités), modif, retrait ; panier par acheteur (un autre user a un panier
  distinct).
- checkout : panier vide → `400` ; stock insuffisant → `400` (nomme le produit) ; sinon crée l'`Order`
  `pending` avec lignes snapshot (nom/prix figés) et vide le panier ; `property_id` d'une autre agence → `400`.
- paiement : `pay` sur `pending` → `paid` + `paid_at` + **stock décrémenté** ; re-`pay` → `409` ; stock
  devenu insuffisant → `409`.
- isolation : agence B ne voit pas les commandes de A ; super-admin voit tout et change le statut.
- snapshot : modifier le prix d'un produit après commande ne change pas le `total` de la commande.
**Frontend** : `/backoffice/boutique`, `/backoffice/mes-commandes`, `/admin/produits`, `/admin/commandes`
rendent 200 ; build prod OK ; smoke test : parcourir → ajouter au panier → checkout → payer → commande
`paid`, stock décrémenté ; super-admin ajoute un produit + fait avancer une commande.

## 10. Fichiers touchés (indicatif)
- **Backend** : `models/shop.py` (new), `models/__init__.py`, migration `add_marketplace`,
  `services/product_categories.py` (new), `api/v1/backoffice/shop.py` (new) + enregistrement,
  `api/v1/admin/shop.py` (new) + enregistrement dans `admin/__init__.py`, `seed_backoffice.py`
  (produits démo), `scripts/verify_shop_*.py`.
- **Frontend** : `pages/backoffice/shop/*` (ShopCatalog, ProductDetail, Cart, OrdersList, OrderDetail),
  `pages/admin/AdminProducts.jsx`, `pages/admin/AdminOrders.jsx`, `services/shopService.js`, câblage
  routeur + menus (backoffice + super-admin).

## 11. Séquencement (pour le plan)
(1) modèles + migration ; (2) catégories (constante) + seed produits ; (3) API vitrine produits +
catégories ; (4) API panier ; (5) API checkout/commandes + paiement (mock) ; (6) API super-admin
produits ; (7) API super-admin commandes ; (8) front catalogue + fiche produit ; (9) front panier +
checkout ; (10) front mes commandes (liste + détail + payer) ; (11) front super-admin produits ;
(12) front super-admin commandes ; (13) vérif intégrée + build.

---

## Annexe — décomposition globale
0. ❤️ · 1. 🛡️ Super-admin — livré · 2. 👥 Équipes — livré · 3. 📊 Dashboard — livré ·
4. 📄 Contrats — livré · 5. ⚖️ Juridique & notaires — livré · 6. 🔧 Artisans — livré ·
**7. 🛋️ Marketplace — cette spec (dernière brique)**.
