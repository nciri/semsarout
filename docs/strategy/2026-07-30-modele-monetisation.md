# Spec — Modèle économique & monétisation SemsarOut

> **Statut :** point de départ (v1, 2026-07-30). Document de cadrage stratégique + produit, à
> itérer. Il fixe les segments, les deux configurations de marché (B2B2B2C / B2B2C), le modèle de
> monétisation, les écarts techniques à combler et les décisions ouvertes. Chaque chantier qui en
> découle aura ensuite son propre spec → plan → exécution.
>
> **Non couvert ici :** l'implémentation détaillée (endpoints, UI). Ce doc décide *quoi* et *pourquoi*,
> pas *comment* ligne à ligne.

---

## 1. Problème à résoudre

Le modèle de comptes actuel comporte un **trou de revenus** : un utilisateur « particulier » (compte
gratuit) peut **publier des annonces sans limite ni contrôle**. Si des professionnels (agences,
promoteurs) s'aperçoivent qu'ils peuvent diffuser gratuitement via des comptes particuliers, ils ne
souscriront jamais d'offre payante → **manque à gagner** et **cannibalisation** des offres pros.

Ce document définit comment **segmenter, plafonner et monétiser** pour que :
1. le gratuit reste utile au vrai particulier (vendre/louer *son* bien, chercher, candidater) ;
2. tout usage **professionnel** (volume, outillage, projets neufs) bascule naturellement en payant ;
3. la plateforme capte de la valeur **au-delà de l'abonnement** (boosts, leads, transactions, service).

---

## 2. État des lieux technique (ce qui existe déjà)

Beaucoup d'infrastructure est **déjà en place** — le manque est surtout dans l'**application** des
règles, pas dans les fondations.

### 2.1 Paliers d'abonnement (`backend/app/models/subscription.py`, seed `seed_plans`)
Modèle `SubscriptionPlan` riche. Paliers actuels (MAD/mois) :

| Plan | Prix/mois | Prix/an | max_listings | featured / urgent | programs (max) | seats / teams | Divers |
|---|---|---|---|---|---|---|---|
| **Starter** | 299 | 2990 | 10 | 1 / 1 | ✗ | 0 / 0 | lead_contact |
| **Pro** | 799 | 7990 | 50 | 5 / 5 | ✓ (10) | 5 / 1 | API, CSV, StayManager, analytics |
| **Enterprise** | 1999 | 19990 | -1 (illimité) | 20 / 20 | ✓ (-1) | -1 / -1 | support prioritaire, KAM dédié |

**Champs de capacité déjà modélisés** : `max_listings`, `max_featured`, `max_urgent`, `has_api_access`,
`has_csv_import`, `has_staymanager_sync`, `has_lead_contact`, `has_analytics`, `has_priority_support`,
`has_dedicated_account_manager`, `has_programs`, `max_programs`, `has_contracts`, `has_legal`,
`has_artisans`, `max_seats`, `max_teams`, `price_monthly`, `price_yearly` (`-1` = illimité).

### 2.2 Gating par capacité
- Les features sont dérivées du plan (`backend/app/api/v1/auth.py` construit la liste `features` :
  `artisans`, `contracts`, `legal`, + `rental` pour la gestion locative).
- Le module **Programmes** est déjà gaté « Pro+ » (`programs.py:require_programs_feature`,
  `subscription.plan.has_programs`) et rattaché à une **agence** (`Program.agency_id`) → un particulier
  ne peut pas en créer.
- Back-office (CRM, gestion locative, contrats, legal, artisans, boutique) déjà cloisonné par feature.

### 2.3 Leviers de monétisation déjà amorcés
- **Mise en avant** : `Property.is_featured` (« à la une ») + `max_featured` / `max_urgent` par plan.
- **Leads** : `Lead.is_charged` (facturation de lead amorcée), `has_lead_contact` par plan,
  scoping correct (`owner_id` pour un particulier, `agency_id` pour une agence).
- **Paiement** : intégration **Stripe** (`StripeConfig`, page `Subscription`), boutique/commandes.
- **Outillage métier livré** (ce que les pros achètent réellement) : CRM (clients/pipeline/leads/
  visites), **gestion locative complète** (mandats, baux, quittancement, CRG, candidatures, EDL,
  décompte de caution, **signature électronique 3a9dSign**), contrats, legal/notaires, artisans,
  **programmes** (promoteurs), équipe/sièges, analytics, StayManager.

### 2.4 Les écarts (le « trou »)
- ❌ **Aucun palier « Gratuit / Particulier »** défini (le moins cher est Starter à 299 MAD).
- ❌ **`max_listings` n'est appliqué nulle part** à la publication → un particulier publie sans limite.
- ❌ Pas de **plafond de programmes** appliqué pour un promoteur hors abonnement.
- ❌ Pas encore de **boosts à la carte** monétisés (paiement unitaire annonce/programme).
- ❌ Pas de **moteur de commission** (transactions/loyers) pour le mode « agence en ligne ».

---

## 3. Segments & personas

| Segment | A une agence ? | Ce qu'il fait | Ce pour quoi il paie |
|---|---|---|---|
| **Particulier** (gratuit) | non | Vend/loue **son** bien (1–3), cherche, candidate, consulte ses documents | Rien (base) — mais **boosts à la carte** et **déblocage de contact** possibles |
| **Agence** | oui | Gère un portefeuille de biens + clients (transaction & gestion locative) | **L'outillage métier** (CRM, gestion locative, contrats, équipe, analytics) + volume d'annonces |
| **Promoteur** | oui (ou statut dédié) | Commercialise des **programmes neufs** (multi-lots, VEFA) | **Le module Programmes** (page-projet, lots, plans, statut chantier) + volume de programmes |
| **Plateforme = agence en ligne** | — | SemsarOut joue le rôle d'agence pour le particulier/promoteur (mandat en ligne, gestion locative déléguée, signature) | Modèle **service** : abonnement service ou **commission** sur loyers/ventes |
| **Superadmin** | non | Exploitation plateforme | — |

> **Note produit** : un « particulier » n'est pas seulement chercheur — il peut être **propriétaire-
> annonceur** (d'où les onglets « Mes annonces » / « Demandes-Leads » légitimes dans son espace).
> C'est précisément pourquoi le plafond `max_listings` bas (et non « 0 ») est le bon curseur.

---

## 4. Les deux configurations de marché

SemsarOut peut opérer **deux modèles simultanément**, selon le client servi.

### 4.1 Configuration A — B2B2B2C : SaaS pour agences (les agences intermédient les promoteurs)
```
Promoteur ──(confie la commercialisation)──▶ Agence ──(utilise SemsarOut SaaS)──▶ Consommateur
                                                │
                                        SemsarOut = éditeur SaaS
```
- SemsarOut **vend un abonnement** à l'agence ; l'agence gère les programmes du promoteur *pour lui*.
- Revenu SemsarOut = **abonnement agence** (Pro/Enterprise avec `has_programs`) + boosts.
- L'agence garde la relation promoteur & consommateur ; SemsarOut est « invisible » côté client final.

### 4.2 Configuration B — B2B2C : SemsarOut « agence en ligne » (court-circuite l'agence)
```
Promoteur / Propriétaire ──(mandat en ligne)──▶ SemsarOut (agence en ligne) ──▶ Consommateur
```
- SemsarOut **joue lui-même le rôle d'agence** : mandat en ligne, diffusion, gestion locative
  déléguée (quittancement, CRG, EDL, décompte), **signature électronique** — **tout est déjà construit**.
- Revenu SemsarOut = modèle **service** : **abonnement service** *ou* **commission** (sur loyers
  gérés / sur ventes conclues) — **décision ouverte (§9)**.
- Positionnement : moins cher / plus simple qu'une agence traditionnelle pour le promoteur ou le
  bailleur particulier qui veut déléguer sans payer 5–8 % à une agence classique.

### 4.3 Coexistence
Les deux ne s'excluent pas : la même plateforme est **éditeur SaaS** pour les agences **et**
**opérateur agence-en-ligne** en direct. Risque à gérer : **conflit de canal** (une agence cliente
peut percevoir l'offre directe comme concurrente). Atténuations possibles : cibler l'agence-en-ligne
sur les segments **non couverts** par les agences (petits bailleurs, gestion locative déléguée,
promoteurs sans réseau d'agences), tarification/marque distincte. **Décision ouverte (§9).**

---

## 5. Modèle de monétisation

### 5.1 Principe directeur
**On ne vend pas « le droit de publier ». On vend (a) du volume, (b) de l'outillage métier,
(c) de la visibilité, (d) de la mise en relation / du service.** Le particulier garde une porte
d'entrée gratuite crédible ; le professionnel bascule dès qu'il a besoin de volume, d'outils ou de
projets.

### 5.2 Paliers d'abonnement (proposition)
> Curseurs chiffrés = **décisions ouvertes** ; valeurs ci-dessous = point de départ à valider.

| Palier | Cible | max_listings | Programmes | Outillage | Prix (piste) |
|---|---|---|---|---|---|
| **Gratuit / Particulier** | vendeur/bailleur particulier, chercheur | **1–3** actives | ✗ | aucun (espace perso) | 0 |
| **Agence Starter** | petite agence | 10 | ✗ | CRM de base, gestion locative selon option | 299 |
| **Agence Pro** | agence en croissance | 50 | ✓ (10) | CRM complet, gestion locative, contrats, analytics, équipe | 799 |
| **Agence Enterprise** | grande agence / réseau | -1 | ✓ (-1) | tout + support/KAM | 1999 |
| **Promoteur** *(palier ou add-on — §9)* | promoteur neuf | selon | ✓ (n) | Programmes + lots + plans | à définir |
| **Agence en ligne (service)** | particulier/promoteur qui délègue | — | selon | mandat + gestion locative déléguée + signature | abonnement service **ou** commission |

### 5.3 Gating par capacité (rappel des interrupteurs déjà modélisés)
`max_listings`, `max_featured`, `max_urgent`, `max_programs`, `max_seats`, `max_teams`,
`has_programs`, `has_contracts`, `has_legal`, `has_artisans`, `has_analytics`, `has_api_access`,
`has_csv_import`, `has_staymanager_sync`, `has_lead_contact`, `has_priority_support`,
`has_dedicated_account_manager`. **La brique existe — il faut surtout l'APPLIQUER.**

### 5.4 Levier décisif #1 — plafonds appliqués
- **`max_listings` contrôlé à la publication/activation** : compter les annonces **actives** du
  compte vs `plan.max_listings` ; au-delà → refus (HTTP 402/403) + invitation à upgrader ou à
  booster/renouveler. Un vrai pro (dizaines/centaines de biens) est **mécaniquement** forcé de payer.
- **`max_programs` contrôlé à la création de programme** (même logique, côté promoteur).
- Ces deux contrôles ferment ~90 % du trou **à eux seuls**.

### 5.5 Levier #2 — boosts à la carte (transverse, y compris gratuit)
Monétiser les **particuliers** aussi, sans exiger un compte pro. Paiement **unitaire** via Stripe :
- **Mise à la une** (`is_featured`, déjà là) ; **badge urgent** (`is_urgent`) ; **remontée en tête**
  de recherche ; **durée de publication + renouvellement payant** (expiration → « rebump ») ; **pack
  photos/vidéo/visite 3D** ; au niveau **programme** : page-projet mise en avant, campagne de lancement.

### 5.6 Levier #3 — leads & transactions
- **Déblocage de contact** : le gratuit voit qu'il a des leads mais **paie pour les coordonnées**
  (ou l'inverse selon UX) — s'appuie sur `has_lead_contact` / `is_charged`.
- **Pay-per-lead qualifié** (surtout neuf/haut de gamme, où un lead vaut cher).
- **Commission / success-fee** sur transaction conclue via la plateforme (cœur du mode B2B2C).

### 5.7 Levier #4 — le service « agence en ligne » (B2B2C)
SemsarOut délègue-t-il ? Non : **il opère**. On facture le **service** de gestion :
- **Abonnement service** (forfait mensuel de gestion locative déléguée par bien), **ou**
- **Commission** : % sur loyers encaissés (gestion) et/ou % sur prix de vente (transaction).
- Ce que la plateforme fournit est **déjà construit** : mandat en ligne, diffusion, quittancement,
  CRG, EDL entrée/sortie, décompte de caution, **signature électronique**. → time-to-market court.

---

## 6. Les deux paywalls professionnels

| | **Agence** | **Promoteur** |
|---|---|---|
| Achète | le **workflow** (transaction + gestion) | le **projet multi-lots** |
| Module clé | CRM + gestion locative + contrats + équipe | **Programmes** (`has_programs`/`max_programs`) |
| Pourquoi il ne contourne pas | volume + besoin d'outils/équipe | l'alternative gratuite (N annonces éparses) **ne fait pas le job** : ni page-projet, ni inventaire de lots (`ProgramUnit`), ni plans/typologies (`ProgramPlan`), ni statut chantier, ni commercialisation progressive, ni lead→lot |
| Défendabilité | forte (volume + outils) | **très forte** (produit gratuit inutilisable pour lui) |

> Le paywall **Programmes** est le plus solide : il ne repose pas sur une limite artificielle mais sur
> le fait que le produit gratuit est structurellement inadapté au neuf multi-lots.

---

## 7. Anti-contournement & conformité
- **Plafond `max_listings`** = premier filtre automatique (un pro déguisé en particulier heurte vite
  la limite).
- **Détection d'usage pro** : volume/cadence de publication, langage commercial, réutilisation de
  coordonnées → nudge/obligation d'upgrade.
- **Statut professionnel (CGU + KYC pro)** : au-delà d'un seuil, compte pro obligatoire (mandat, RC
  pro). Aligne avec les obligations légales du courtage/gestion.
- **Vérification / badges** (KYC déjà présent côté identité) : « agence vérifiée », « promoteur
  vérifié » → conversion + confiance, valeur payante.

---

## 8. Écarts techniques à combler (backlog priorisé)
1. **Palier « Gratuit / Particulier »** dans `SubscriptionPlan` (+ attribution par défaut à tout
   compte sans agence) — *prérequis.*
2. **Application de `max_listings`** à la publication/activation d'annonce (compteur d'annonces
   actives vs plan) + message d'upgrade. *(Le plus gros ROI.)*
3. **Application de `max_programs`** à la création de programme.
4. **Boosts à la carte** (à la une / urgent / renouvellement) : catalogue + paiement Stripe unitaire
   + expiration/rebump.
5. **Monétisation lead** : déblocage de contact payant (s'appuyer sur `is_charged`/`has_lead_contact`).
6. **Moteur de commission** (mode agence-en-ligne) : calcul % sur loyers encaissés / ventes + reversement.
7. **Palier / add-on Promoteur** (selon décision §9) + tarification par programmes/lots.
8. **Garde-fous canal** (marque/tarif distincts si conflit agences ↔ offre directe).

---

## 9. Décisions ouvertes (à trancher avant les specs de mise en œuvre)
1. **Curseurs du gratuit** : combien d'annonces actives (1 ? 2 ? 3 ?) ; le déblocage de contact des
   leads est-il gratuit ou payant pour le particulier ?
2. **Promoteur : palier séparé OU add-on `Programmes` sur un plan Agence ?** (une agence fait aussi du
   neuf → l'add-on a du sens ; un promoteur pur → un palier dédié est plus lisible).
3. **Mode B2B2C — abonnement service vs commission** (ou hybride) : quel taux de commission
   loyers/ventes, ou quel forfait de gestion par bien ?
4. **Conflit de canal** agences (SaaS) ↔ agence-en-ligne (direct) : marques séparées ? segments
   réservés ? tarification différenciée ?
5. **Grille de prix** définitive (particulier boosts, paliers pros, commission) et **devise/TVA**.
6. **Politique d'expiration** des annonces (durée gratuite, coût de renouvellement).
7. **Migration** des comptes existants (les particuliers ayant déjà > plafond au lancement).

---

## 10. Découpage en sous-projets (chacun → son spec → plan → exécution)
- **P1 — Palier Gratuit + application `max_listings`** (ferme le trou principal). *Prioritaire.*
- **P2 — Boosts à la carte** (à la une / urgent / renouvellement) + paiement Stripe.
- **P3 — Promoteur** (palier ou add-on) + application `max_programs` + tarification programmes.
- **P4 — Agence en ligne (B2B2C)** : moteur de commission / forfait de gestion + parcours mandat direct.
- **P5 — Monétisation leads** (déblocage contact / pay-per-lead).
- **P6 — Anti-contournement & statut pro** (détection + CGU + KYC pro/badges).

---

## 11. Indicateurs de succès (à instrumenter)
- Taux de conversion gratuit → payant ; part des comptes heurtant le plafond `max_listings`.
- ARPU par segment (particulier boosts / agence / promoteur / agence-en-ligne).
- Revenu boosts par annonce ; revenu commission par transaction gérée.
- Nombre de programmes actifs payants ; nombre de biens en gestion déléguée (B2B2C).
- Fuite : comptes particuliers au comportement « pro » détectés / convertis.

---

## 12. Résumé exécutif
Le « trou » n'est pas structurel — il est **d'application** : le champ `max_listings` existe mais
n'est pas contrôlé, et aucun palier gratuit n'est défini. En (1) créant un **palier gratuit plafonné
et appliqué**, (2) gardant l'**outillage pro** (agences) et les **Programmes** (promoteurs) derrière
le paywall — déjà en place — et (3) ajoutant des **revenus transverses** (boosts, leads, commission),
on transforme le risque en **plusieurs flux de revenus**. La plateforme peut de plus opérer en
**double modèle** : SaaS pour agences (B2B2B2C) **et** agence-en-ligne directe (B2B2C), en s'appuyant
sur la gestion locative déjà construite (mandat, quittancement, EDL, décompte, signature).
