# Spec — Juridique & notaires (Pro / Entreprise)

**Date :** 2026-07-23
**Brique :** 5 / 8 de la refonte
**Statut :** validé, prêt pour le plan d'implémentation
**Dépend de :** brique 1 (rôles), brique 2 (plans/permissions), brique 4 (transactions/documents).

---

## 1. Contexte & problème

`PropertyDocument` gère déjà les pièces juridiques d'un **bien** (`titre_foncier`, `cin`, `plan`,
`reglement_copropriete`, `diagnostic`). Mais il n'existe **aucun annuaire de notaires** ni **suivi
de dossier juridique** au niveau d'une **transaction** (le stade `final_act` du pipeline reste
non outillé). La brique 5 ajoute : un **répertoire de notaires** assignables à une transaction, et
un **dossier juridique** par transaction (checklist d'étapes/documents légaux, avec statut,
échéance, responsable), réservé aux plans **Pro/Entreprise**.

## 2. Décisions validées
| Sujet | Décision |
|-------|----------|
| Périmètre | **Annuaire notaires + dossier juridique** de transaction (les deux) |
| Notaire | **Entité `Notary` dédiée** (répertoire par agence) |
| Dossier juridique | **Checklist générée par modèle** (vente/location) puis **éditable** (ajout/retrait/coche) |
| Gating | Réservé **Pro + Entreprise** via flag plan `has_legal` |

## 3. Modèle de données

### 3.1 `Notary` (`backend/app/models/legal.py`)
`id`, `agency_id` (FK, index), `name`, `office` (étude), `city`, `phone`, `email`,
`license_number`, `notes`, `created_at`, `updated_at`. `to_dict()`.

### 3.2 `LegalCase` (`backend/app/models/legal.py`)
`id`, `agency_id` (FK, index), `transaction_id` (FK nullable), `property_id` (FK nullable),
`notary_id` (FK `notaries.id`, nullable), `title`, `case_type` (`sale`/`rental`), `status`
(`open`/`in_progress`/`closed`, défaut `open`), `notes`, `created_by` (FK users), `created_at`,
`updated_at`. `to_dict()` inclut `tasks_done`/`tasks_total` et `notary` (résumé).

### 3.3 `LegalTask` (`backend/app/models/legal.py`)
`id`, `legal_case_id` (FK, index), `label`, `status` (`todo`/`in_progress`/`done`, défaut `todo`),
`due_date` (nullable), `assignee_id` (FK users nullable), `position` (int, ordre), `notes`,
`completed_at`, `created_at`. `to_dict()`.

### 3.4 `SubscriptionPlan` (ajout) — `has_legal` (Boolean, défaut False) + `to_dict()`.

### 3.5 Migration
`add_legal` : tables `notaries`, `legal_cases`, `legal_tasks` + colonne `subscription_plans.has_legal`.
`down_revision` = tête courante. Rétro-compatible.

## 4. Modèles de checklist (constante backend)
`backend/app/services/legal_checklists.py` : `LEGAL_CHECKLISTS = {'sale': [...], 'rental': [...]}`
listant les étapes par défaut. Exemples :
- **sale** : « Vérification du titre foncier », « Certificat de propriété récent », « Quitus fiscal / taxes à jour »,
  « Compromis de vente signé », « Dépôt du dossier chez le notaire », « Levée des conditions suspensives »,
  « Signature de l'acte définitif », « Enregistrement & conservation foncière ».
- **rental** : « Vérification de la propriété », « État des lieux d'entrée », « Contrat de bail signé »,
  « Dépôt de garantie encaissé », « Enregistrement du bail ».
Helper `default_tasks(case_type) -> list[str]` (fallback `sale` si type inconnu).

## 5. Gating & autorisation
- Garde `require_legal` (après `require_auth`) → `403` sauf si le plan de l'agence a `has_legal`
  (« Fonction réservée aux plans Pro et Entreprise »).
- **Isolation agence** : notaires, dossiers et tâches ne sont lisibles/modifiables que par leur
  agence (`g.agency_id`). Les routes de tâches vérifient que le **dossier parent** appartient à
  l'agence avant toute opération.

## 6. API — `backend/app/api/v1/backoffice/legal.py` (agency-scoped, `require_legal`)

### 6.1 Notaires (annuaire)
- `GET /backoffice/notaries` — répertoire de l'agence.
- `POST /backoffice/notaries` `{name, office?, city?, phone?, email?, license_number?, notes?}`.
- `PUT`/`DELETE /backoffice/notaries/:id` — sur ses propres notaires uniquement.

### 6.2 Dossiers juridiques
- `GET /backoffice/legal-cases?transaction_id=&status=` — liste (résumé + progression).
- `POST /backoffice/legal-cases` `{title?, transaction_id?, property_id?, case_type?, notary_id?}` →
  crée le dossier ; `case_type` dérivé de la transaction si fournie (`sale`/`rental`), sinon du body
  (défaut `sale`) ; **génère les `LegalTask` depuis le modèle** correspondant.
- `GET /backoffice/legal-cases/:id` — dossier + tâches (triées par `position`) + notaire.
- `PUT /backoffice/legal-cases/:id` `{title?, status?, notary_id?, notes?}` (notary_id validé
  appartenant à l'agence).
- `DELETE /backoffice/legal-cases/:id` (supprime les tâches en cascade applicative).

### 6.3 Tâches
- `POST /backoffice/legal-cases/:id/tasks` `{label, due_date?, assignee_id?}` → ajoute une tâche
  (position = max+1).
- `PUT /backoffice/legal-tasks/:id` `{label?, status?, due_date?, assignee_id?, position?}` →
  met à jour (si `status='done'` → `completed_at=now` ; sinon `completed_at=null`). Vérifie que la
  tâche appartient à un dossier de l'agence.
- `DELETE /backoffice/legal-tasks/:id` (même vérification d'appartenance).

## 7. Front (backoffice) — `has_legal` requis

### 7.1 Répertoire notaires (`frontend/src/pages/backoffice/legal/NotariesDirectory.jsx`)
Liste + formulaire créer/éditer/supprimer un notaire (nom, étude, ville, tél, email, agrément).
Masquée/verrouillée (CTA upgrade) sur `403`.

### 7.2 Dossiers juridiques
- `LegalCasesList` : liste (titre, transaction liée, notaire, statut, **progression** X/Y),
  bouton « Nouveau dossier » (choix transaction OU bien + type + notaire).
- `LegalCaseDetail` : en-tête (statut, notaire assignable depuis l'annuaire, progression) +
  **checklist** : cocher (todo→in_progress→done), ajouter/retirer une étape, échéance, responsable
  (membre de l'équipe), notes. Barre de progression.
- `legalService.js` (via l'instance `api` partagée).

### 7.3 Navigation
Entrées de menu backoffice « Notaires » et « Juridique » gardées par `has_legal` (CTA upgrade si
non éligible). Réutilise le pattern de gating de la brique 4 (contrats).

## 8. Seed
- `has_legal=True` sur les plans `pro` et `enterprise`.
- Quelques notaires de démonstration par agence (optionnel, pour peupler l'annuaire).
- Les modèles de checklist sont des **constantes de code** (pas de seed).

## 9. Tests (avant « terminé »)
**Backend (scripts Python)** :
- garde : agence sans `has_legal` → `403` sur toutes les routes ; avec → `200`.
- notaires : CRUD ; une agence ne voit/altère pas les notaires d'une autre (`404`).
- dossiers : `POST` avec `case_type='sale'` **génère** la checklist vente (nb de tâches = modèle) ;
  dérivation depuis une transaction (`transaction_type` → `case_type`) ; progression correcte.
- tâches : ajout (position incrémentée) ; `PUT status='done'` → `completed_at` rempli ; toggle retour
  `todo` → `completed_at` null ; suppression ; une tâche d'une autre agence → `404`.
- `notary_id` d'une autre agence refusé à l'assignation (`400/404`).
- isolation : agence B ne voit/altère pas les dossiers de A.
**Frontend** : `/backoffice/notaires` et `/backoffice/juridique` rendent 200 ; build prod OK ;
smoke test : créer un notaire, créer un dossier (checklist générée), cocher des étapes, assigner un
notaire, voir la progression.

## 10. Fichiers touchés (indicatif)
- **Backend** : `models/legal.py` (new), `models/subscription.py` (+`has_legal`), `models/__init__.py`,
  migration `add_legal`, `services/legal_checklists.py` (new), `api/v1/backoffice/legal.py` (new) +
  enregistrement, `seed_backoffice.py` (flag + notaires démo), `scripts/verify_legal_*.py`.
- **Frontend** : `pages/backoffice/legal/*` (NotariesDirectory, LegalCasesList, LegalCaseDetail),
  `services/legalService.js`, câblage routeur + menu backoffice.

## 11. Séquencement (pour le plan)
(1) modèles + `has_legal` + migration ; (2) checklists (constante) + seed flag/notaires ;
(3) garde `require_legal` + API notaires ; (4) API dossiers (création+génération checklist, liste,
get, update, delete) ; (5) API tâches ; (6) front notaires (service + annuaire + gating + route/menu) ;
(7) front dossiers (liste + détail checklist) ; (8) vérif intégrée + build.

---

## Annexe — décomposition globale
0. ❤️ · 1. 🛡️ Super-admin — livré · 2. 👥 Équipes — livré · 3. 📊 Dashboard — livré ·
4. 📄 Contrats — livré · **5. ⚖️ Juridique & notaires — cette spec** · 6. 🔧 Artisans ·
7. 🛋️ Marketplace meubles.
