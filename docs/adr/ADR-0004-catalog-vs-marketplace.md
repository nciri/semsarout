# ADR-0004 — Séparer `catalog` (produits plateforme) de `marketplace` (transactionnel agence)

- **Statut :** accepté
- **Contexte :** le catalogue de produits (mobilier/électroménager) est **plateforme** —
  géré par le **super-admin**, partagé par toutes les agences — tandis que le panier et les
  commandes sont **agence**. Mélanger les deux dans un seul service confond deux concepts
  aux propriétaires, cycles de vie et droits différents.

## Décision

Deux services distincts (la cible passe de 18 à **19 services**) :

- **`catalog`** — **source de vérité des produits**. CRUD réservé au **super-admin** ; les
  agences lisent le catalogue actif. Émet `product.created` / `product.updated` /
  `product.deleted`. La **découverte** (recherche/filtres produits) se fait via une
  **projection OpenSearch** alimentée par ces événements (même patron que `search`).
- **`marketplace`** — **panier + commandes**, cloisonné par **agence**. Ne **possède pas**
  les produits : il **référence** le catalogue (par `product_id`) et **fige un snapshot**
  du nom/prix à la commande (comme le monolithe). Déclenche le paiement en **séquestre**
  via le service `payment` ; à `payment.released`, la commande passe à « payée »
  (chorégraphie, comme billing↔payment).

## Conséquences

- **+** Découplage net plateforme (catalogue) / agence (transactionnel) ; droits clairs.
- **+** Le catalogue évolue (prix, stock) sans impacter les commandes déjà figées (snapshots).
- **−** Un service de plus (19) et une projection catalogue à maintenir — jugé acceptable
  au regard de la clarté des responsabilités.

> Alternative écartée : tout dans `marketplace` (18 services). Plus simple mais mélange
> un référentiel plateforme et un flux transactionnel agence.
