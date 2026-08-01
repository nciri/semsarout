# Spec — Édition de contrats (Pro / Entreprise)

**Date :** 2026-07-23
**Brique :** 4 / 8 de la refonte
**Statut :** validé, prêt pour le plan d'implémentation
**Dépend de :** brique 1 (rôles/impersonation), brique 2 (plans/permissions).

---

## 1. Contexte & problème

`TransactionDocument` existe déjà (types `mandate`/`compromise`/`lease`/`invoice`…, champs e-signature) mais ne stocke que des **fichiers uploadés** — aucun système de **modèles + édition** de contrats. Le backend sait déjà générer des PDF (ReportLab, `generate_invoice_pdf`). Il manque : des **modèles de contrats** avec champs de fusion, une **édition WYSIWYG**, une **génération PDF** du contrat, le tout réservé aux plans **Pro/Entreprise**.

## 2. Décisions validées
| Sujet | Décision |
|-------|----------|
| Éditeur | **WYSIWYG riche** (`react-quill-new`, fork maintenu compatible React 18) → stocke du HTML |
| PDF | Rendu **HTML→PDF côté serveur** via `xhtml2pdf` (pur Python) |
| Signature | **Génération + suivi de statut** (draft→finalized→signed manuel) ; e-sign tiers = brique ultérieure |
| Modèles | **Intégrés (globaux) pour tous** + **custom réservés au plan Entreprise** |
| Modèles livrés | mandat de vente, mandat location/gestion, compromis de vente, bail habitation |
| Rattachement | Contrat **autonome** (bien + client directs) **ou** lié à une transaction (optionnel) |
| Stockage PDF | Sur le `Contract` (`pdf_url`) **+** copie auto en `TransactionDocument` si lié à une transaction |
| Gating | Flag plan `has_contracts` (Pro+Entreprise) ; custom-templates = plan `enterprise` |

## 3. Sécurité (obligatoire)
Le HTML issu du WYSIWYG est **contenu utilisateur ré-affiché** → risque de **XSS stocké**. Tout `body_html` (contrats ET modèles custom) est **nettoyé côté serveur avec `bleach`** à l'enregistrement : allowlist de balises (`p, br, strong, b, em, i, u, s, ul, ol, li, h1..h4, blockquote, table, thead, tbody, tr, td, th, span, a`), attributs limités (`a[href]` avec protocoles `http/https/mailto`, `td/th[colspan,rowspan]`, `style` restreint à `text-align`), tout le reste supprimé. Jamais de `<script>`/`<style>`/`on*`/`javascript:`. Le front reste défensif au rendu (pas de `dangerouslySetInnerHTML` sans passer par ce HTML déjà nettoyé).

## 4. Modèle de données

### 4.1 `ContractTemplate` (`backend/app/models/contract.py`)
`id`, `agency_id` (FK nullable — **null = modèle intégré global**), `document_type` (`mandate_sale`/`mandate_rental`/`compromise`/`lease`/`other`), `name`, `body_html` (avec placeholders `{{champ}}`), `is_builtin` (bool), `created_by` (FK users nullable), `created_at`, `updated_at`. `to_dict()`.

### 4.2 `Contract` (`backend/app/models/contract.py`)
`id`, `agency_id` (FK, index), `title`, `document_type`, `template_id` (FK nullable), `transaction_id` (FK nullable), `property_id` (FK nullable), `client_id` (FK nullable), `body_html` (rempli puis édité, nettoyé), `merge_context` (JSON figé à l'instanciation), `status` (`draft`/`finalized`/`signed`, défaut `draft`), `pdf_url` (nullable), `created_by` (FK users), `finalized_at`, `signed_at`, `created_at`, `updated_at`. `to_dict()`.

### 4.3 `SubscriptionPlan` (ajout — `subscription.py`)
`has_contracts` (Boolean, défaut False) + dans `to_dict()`. Seed : pro+enterprise → True.

### 4.4 Migration
`add_contracts` : tables `contract_templates`, `contracts` + colonne `subscription_plans.has_contracts`. `down_revision` = tête courante. Rétro-compatible.

## 5. Champs de fusion (résolveur)
Service `backend/app/services/contract_merge.py` : `build_context(agency, *, transaction=None, property=None, client=None) -> dict` et `render(body_html, context) -> str` (substitue `{{key}}`; une clé absente → chaîne vide, jamais d'erreur). Clés fournies (documentées) :
`date`, `agency_name`, `agency_address`, `agency_license`, `agent_name`,
`property_address`, `property_city`, `property_type`, `property_price`, `property_surface`, `property_rooms`, `property_reference`,
`client_name`, `client_email`, `client_phone`,
`transaction_reference`, `asking_price`, `commission_rate`, `commission_amount`.
Montants formatés (MAD, séparateur `fr-FR`). Si `transaction` est fourni, en dériver `property`/`client` quand absents.

## 6. Gating & autorisation
- Décorateur/garde `require_contracts` : après `require_auth`, vérifie que l'abonnement de l'agence a `plan.has_contracts` → sinon `403` (message « Passez à un plan Pro/Entreprise »).
- Helper `can_manage_templates(agency)` = plan de l'agence a `slug == 'enterprise'` → sinon les routes de CRUD de modèles renvoient `403`.
- Toutes les routes sont **agency-scoped** (`g.agency_id`) : un contrat/modèle n'est lisible/modifiable que par son agence (les modèles globaux `agency_id=null` sont en lecture seule pour tous).

## 7. API — `backend/app/api/v1/backoffice/contracts.py`

### 7.1 Modèles
- `GET /backoffice/contract-templates` → globaux (`agency_id null`) **+** modèles de l'agence.
- `POST /backoffice/contract-templates` `{name, document_type, body_html}` → **Entreprise only** ; crée un modèle `agency_id=g.agency_id`, `is_builtin=False` ; `body_html` nettoyé.
- `PUT`/`DELETE /backoffice/contract-templates/:id` → Entreprise only, uniquement sur ses propres modèles (jamais un global).

### 7.2 Contrats
- `GET /backoffice/contracts?status=&transaction_id=` → liste (agence).
- `POST /backoffice/contracts` `{template_id, title?, transaction_id?, property_id?, client_id?}` → construit le contexte, **rend** le `body_html` (placeholders remplis), crée le `Contract` (`status='draft'`, `merge_context` figé) et renvoie l'objet.
- `GET /backoffice/contracts/:id`.
- `PUT /backoffice/contracts/:id` `{title?, body_html?}` → sauvegarde le HTML **nettoyé** (interdit si `status != 'draft'`).
- `POST /backoffice/contracts/:id/finalize` → rend le **PDF** (xhtml2pdf) → stocke sous `uploads/documents/`, remplit `pdf_url`, `status='finalized'`, `finalized_at`. Si `transaction_id`, crée aussi un `TransactionDocument` (type = document_type, `file_url=pdf_url`, `requires_signature=True`).
- `POST /backoffice/contracts/:id/mark-signed` → `status='signed'`, `signed_at` (et propage au `TransactionDocument` lié si présent).
- `GET /backoffice/contracts/:id/pdf` → sert le PDF (endpoint authentifié, contrôle d'appartenance à l'agence).
- `DELETE /backoffice/contracts/:id` (draft uniquement, sinon `409`).

## 8. Front (backoffice) — `has_contracts` requis

### 8.1 Dépendance
- Ajouter `react-quill-new` (WYSIWYG ; `react-quill` d'origine n'est plus maintenu et avertit sous React 18). Toolbar : gras/italique/souligné, titres, listes, alignement, lien, tableau si supporté.

### 8.2 Section « Contrats » (`frontend/src/pages/backoffice/contracts/`)
- `ContractsList` : tableau (titre, type, statut, lié à…, date), bouton « Nouveau contrat ». Masquée/verrouillée (CTA upgrade) si `!user.agency.has_contracts` — récupéré via l'abonnement.
- `ContractCreate` : choisir un **modèle** (liste), un **lien** (transaction OU bien+client via sélecteurs), titre → `POST` → redirige vers l'éditeur.
- `ContractEditor` : **react-quill-new** pré-rempli avec `body_html` ; barre latérale d'**insertion de champs de fusion** (insère `{{key}}` — mais comme le contenu est déjà rendu, l'insertion sert surtout aux modèles ; pour un contrat, l'utilisateur édite le texte final) ; boutons **Sauvegarder** (draft), **Finaliser** (→ PDF, verrouille l'édition), **Télécharger PDF**, **Marquer signé**. Statut affiché (badge).
- `TemplatesManager` (**Entreprise only**) : CRUD des modèles custom, éditeur WYSIWYG avec palette de champs de fusion `{{…}}`.
- Entrée de menu backoffice « Contrats » (gardée par `has_contracts`), sous-onglet « Modèles » visible seulement pour Entreprise.
- `contractService.js` (via l'instance `api` partagée).

## 9. Seed
- 4 modèles intégrés **globaux** (`agency_id=null, is_builtin=True`) : `mandate_sale`, `mandate_rental`, `compromise`, `lease`, avec un texte réaliste (droit marocain) truffé de `{{champs}}`.
- `has_contracts=True` sur les plans `pro` et `enterprise`.

## 10. Tests (avant « terminé »)
**Backend (scripts Python)** :
- garde : agence sans `has_contracts` → `403` sur toutes les routes contrats ; avec → `200`.
- templates : `GET` renvoie les globaux ; `POST` refusé (`403`) hors Entreprise, accepté et scellé à l'agence pour Entreprise ; impossible de modifier un modèle global ou d'une autre agence (`403/404`).
- instanciation : `POST /contracts` avec un template + un bien/client remplace bien les `{{champs}}` (le HTML rendu ne contient plus de `{{`), `merge_context` figé.
- sécurité : `PUT` d'un `body_html` contenant `<script>`/`onerror=` → stocké **nettoyé** (plus de script/handler).
- finalize : génère un PDF non vide (`%PDF` en tête), `pdf_url` rempli, `status='finalized'` ; si lié à une transaction, un `TransactionDocument` est créé ; re-`PUT` après finalize → `409`.
- isolation : l'agence B ne voit/altère pas les contrats de l'agence A.
**Frontend** : `/backoffice/contrats` (liste, création, éditeur) rendent 200 ; build prod OK ; smoke test : créer depuis un modèle, éditer, finaliser, télécharger le PDF.

## 11. Fichiers touchés (indicatif)
- **Backend** : `models/contract.py` (new), `models/subscription.py` (+`has_contracts`), `models/__init__.py`, migration `add_contracts`, `services/contract_merge.py` (new), `services/html_sanitize.py` (new, bleach), `api/v1/backoffice/contracts.py` (new) + enregistrement, `seed_backoffice.py` (4 modèles + flag plan), `requirements.txt` (`xhtml2pdf`, `bleach`), `scripts/verify_contracts_*.py`.
- **Frontend** : `package.json` (`react-quill-new`), `pages/backoffice/contracts/*` (List/Create/Editor/TemplatesManager), `services/contractService.js`, câblage routeur + menu backoffice.

## 12. Séquencement (pour le plan)
(1) modèles + migration + flag plan ; (2) sanitize + merge services ; (3) seed modèles + flag ; (4) API templates (+ gating Entreprise) ; (5) API contrats (create/instancie/save) ; (6) finalize PDF + copie TransactionDocument + download ; (7) front liste+création ; (8) front éditeur WYSIWYG + statuts ; (9) front TemplatesManager (Entreprise) ; (10) vérif intégrée + build.

---

## Annexe — décomposition globale
0. ❤️ · 1. 🛡️ Super-admin — livré · 2. 👥 Équipes — livré · 3. 📊 Dashboard — livré ·
**4. 📄 Contrats — cette spec** · 5. ⚖️ Juridique & notaires · 6. 🔧 Artisans · 7. 🛋️ Marketplace meubles.
