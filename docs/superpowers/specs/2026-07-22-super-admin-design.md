# Spec — Espace super-admin plateforme (`/admin`)

**Date :** 2026-07-22
**Brique :** 1 / 8 de la refonte (voir la table de décomposition en fin de document)
**Statut :** validé, prêt pour le plan d'implémentation

---

## 1. Contexte & problème

L'espace `/backoffice` actuel est **cloisonné par agence** : le décorateur `require_auth`
(`backend/app/api/v1/backoffice/dashboard.py`) force `g.agency_id = current_user.agency_id`
et toutes les requêtes filtrent sur cette agence. C'est le CRM/admin **de chaque agence**.

Il n'existe **aucun** niveau plateforme capable de voir et gérer tous les comptes. On introduit
donc un rôle et un espace **au-dessus des agences** : le super-admin Semsar.

**Ce super-admin doit pouvoir :**
- voir tous les comptes (utilisateurs individuels **et** agences/organisations) ;
- consulter l'activité de chaque compte ;
- suspendre / réactiver un compte ;
- supprimer un compte (soft-delete réversible) puis l'anonymiser (RGPD) ;
- se connecter en tant qu'un client (impersonation) pour le dépannage.

Hors périmètre de cette brique (traité dans les briques suivantes) : équipes/sièges Pro &
Entreprise (brique 2), dashboard enrichi (brique 3), contrats, juridique/notaires, artisans,
marketplace meubles.

## 2. Décisions validées

| Sujet | Décision |
|-------|----------|
| Périmètre | Utilisateurs **et** agences |
| Suppression | Soft-delete réversible + action d'anonymisation RGPD séparée |
| Emplacement | Espace dédié séparé `/admin` (distinct du `/backoffice` agence) |
| Purge auto | Oui, anonymisation automatique à **J+90** après suppression |
| Impersonation | Session **complète** + bannière permanente + audit intégral |
| Gestion des équipes | Client autonome **+** override super-admin (→ brique 2, pas ici) |

## 3. Rôle & contrôle d'accès

- Nouveau rôle système `superadmin` : `slug='superadmin'`, `level=0`, `is_system=True`,
  `agency_id=None`. Créé au seed et attribué à un compte Semsar désigné (variable d'env
  `SUPERADMIN_EMAIL` documentée dans `.env.example`, jamais de valeur en dur).
- Nouveau décorateur `require_superadmin` (fichier `backend/app/api/v1/admin/__init__.py`) :
  1. `verify_jwt_in_request()` ; 2. charge `g.current_user` depuis `get_jwt_identity()` ;
  3. refuse `403` si l'utilisateur ne porte pas le rôle `superadmin`. **Aucun** filtrage par
  agence — le super-admin est global.
- L'identité vient **toujours** du token (jamais d'un en-tête client), comme le corrige déjà
  le commit `a8982cb`.
- **Attention sérialisation** : `User.to_dict()` calcule le rôle « principal » via
  `max(roles, key=level)`, or `superadmin` a `level=0` (le plus bas). `user.role` n'est donc
  **pas** fiable pour détecter un super-admin. On ajoute un booléen dédié `is_superadmin`
  (`any(r.slug == 'superadmin' for r in roles)`) dans `to_dict()` ; c'est lui que le front et le
  garde de route consomment.

## 4. Modèle de données

### 4.1 `User` (ajouts — `backend/app/models/user.py`)

| Colonne | Type | Défaut | Rôle |
|---------|------|--------|------|
| `is_suspended` | Boolean | `False` | Suspension par le super-admin |
| `suspended_at` | DateTime | `NULL` | Horodatage de suspension |
| `suspended_reason` | String(255) | `NULL` | Motif affiché |
| `deleted_at` | DateTime | `NULL` | Soft-delete (compte archivé) |
| `anonymized_at` | DateTime | `NULL` | Données perso scrubées (RGPD) |

`is_active` existant est conservé (usage : compte jamais activé / désactivé par le client) —
la suspension super-admin est portée par `is_suspended` pour distinguer les deux causes.

### 4.2 `Agency` (mêmes ajouts — `backend/app/models/agency.py`)

`is_suspended`, `suspended_at`, `suspended_reason`, `deleted_at`, `anonymized_at`.
Suspendre/supprimer une agence est **transitif** : appliqué à tous ses membres au moment du
login (voir §6), sans dénormaliser le flag sur chaque user.

### 4.3 Audit

Réutilise le modèle `ActivityLog` **existant** (`backend/app/models/role.py`). Chaque action
super-admin (suspend, unsuspend, delete, restore, anonymize, impersonate start/stop) écrit un
log avec `user_id` = super-admin, `entity_type` ∈ {`user`,`agency`}, `entity_id`, `action`, et
`extra_data` (motif, cible d'impersonation, etc.).

### 4.4 Migration

Une migration Alembic ajoute les 5 colonnes à `users` et à `agencies` (toutes nullable /
défaut `False`, donc rétro-compatible). Nommée `add_account_moderation_fields`.

## 5. API `/api/v1/admin`

Nouveau blueprint `admin_bp` (`url_prefix='/admin'`), enregistré dans
`backend/app/api/v1/__init__.py`. Toutes les routes sont protégées par `require_superadmin`.

| Méthode & route | Rôle |
|-----------------|------|
| `GET /admin/overview` | KPIs plateforme (voir §5.1) |
| `GET /admin/accounts` | Liste paginée users + agences ; filtres `type`, `status`, `plan`, `q` |
| `GET /admin/accounts/users/:id` | Détail user + timeline d'activité + agence |
| `GET /admin/accounts/agencies/:id` | Détail agence + membres + abonnement + annonces |
| `POST /admin/accounts/users/:id/suspend` · `/unsuspend` | Suspendre / réactiver (body : `reason`) |
| `POST /admin/accounts/agencies/:id/suspend` · `/unsuspend` | Idem au niveau agence |
| `DELETE /admin/accounts/users/:id` · `POST …/restore` | Soft-delete / restauration |
| `DELETE /admin/accounts/agencies/:id` · `POST …/restore` | Idem au niveau agence |
| `POST /admin/accounts/users/:id/anonymize` | Anonymisation RGPD immédiate (manuelle) |
| `POST /admin/accounts/users/:id/impersonate` | Génère un token d'impersonation (voir §7) |
| `GET /admin/activity` | Fil d'activité global (paginé, filtrable par acteur/entité) |

### 5.1 `GET /admin/overview` — charge utile

`total_users`, `total_agencies`, `active_subscriptions` (ventilé par plan), `mrr_estimate`
(somme des `subscriptions.amount` mensuelles actives), `signups_last_30d`, `suspended_count`,
`deleted_pending_purge_count`.

### 5.2 Garde-fous (renvoient `409`/`403` avec message explicite)

- Un super-admin ne peut pas se suspendre / se supprimer / s'anonymiser lui-même.
- Interdit de suspendre/supprimer/rétrograder le **dernier** compte `superadmin` actif.
- Interdit d'impersonate un autre `superadmin`.
- Suspendre/supprimer un compte déjà dans cet état est idempotent (`200`, no-op logué).

## 6. Application de la suspension & du soft-delete (login)

Point d'entrée unique dans `backend/app/api/v1/auth.py` (login) : après vérification du mot de
passe, refuser la connexion (`403`, message clair) si, pour le user **ou** son agence :
`is_suspended is True` **ou** `deleted_at is not None`. Les comptes anonymisés sont de facto
inconnectables (mot de passe scrubé). Les listings d'un compte suspendu/supprimé sont masqués
du public (filtre à ajouter là où les annonces publiques sont listées).

## 7. Impersonation

- `POST /admin/accounts/users/:id/impersonate` (super-admin) → JWT **court** (TTL 30 min) de
  l'utilisateur cible, avec claim additionnel `impersonated_by = <superadmin_id>`. Refusé si la
  cible est un `superadmin`.
- Front : le token super-admin est déplacé dans un slot séparé
  (`localStorage['semsar.adminToken']`) ; le token d'impersonation devient le token actif. Une
  **bannière permanente** en haut de toutes les pages affiche « Connecté en tant que {nom} —
  Quitter ». « Quitter » supprime le token d'impersonation et restaure le token super-admin.
- Audit : début et fin écrivent un `ActivityLog`. Le backend peut lire le claim
  `impersonated_by` pour attribuer toute action réalisée pendant la session.
- Sécurité : le claim `impersonated_by` n'est jamais accepté depuis un header client — il n'est
  émis que par la route d'impersonation signée côté serveur.

## 8. Purge automatique (RGPD, J+90)

- Commande Flask CLI `flask purge-deleted` (`backend/app/commands.py` ou équivalent) :
  sélectionne les comptes `deleted_at < now - 90j` **et** `anonymized_at IS NULL`, puis exécute
  l'anonymisation (§9). Écrit un `ActivityLog` par compte purgé. Idempotente.
- À brancher sur un cron quotidien (exemple documenté dans le README).
- Le détail d'un compte supprimé affiche « Restaurable jusqu'au {deleted_at + 90 j} ».

## 9. Anonymisation (scrub PII)

Opération irréversible appliquée par l'action manuelle **ou** par la purge auto :
`email → deleted+{id}@semsar.invalid`, `first_name/last_name → « Compte supprimé »`,
`phone → NULL`, `avatar_url → NULL`, `password_hash` régénéré sur un secret aléatoire,
`reset_token → NULL`. Positionne `anonymized_at = now`. Les enregistrements liés (annonces,
transactions, factures, leads, logs) sont **conservés** pour l'intégrité référentielle et
l'historique comptable ; ils ne portent plus de PII directe.

## 10. Front `/admin`

Nouvel arbre de routes séparé de `/backoffice` et `/dashboard`, protégé par un garde
`SuperAdminRoute` (redirige si `!user.is_superadmin`, cf. §3). Entrée de menu visible seulement
pour ce rôle.

| Écran | Contenu |
|-------|---------|
| `AdminLayout` | Sidebar : Vue d'ensemble · Comptes · Agences · Activité. Réutilise les patterns du backoffice. |
| `AdminOverview` | Cartes KPI depuis `GET /admin/overview`. |
| `AdminAccounts` | Table users + agences : recherche, filtres (type/statut/plan), badges de statut, actions par ligne (suspendre/réactiver/supprimer/impersonate). |
| `AdminAccountDetail` | Profil, plan/abonnement, timeline d'activité, **zone danger** (suspendre, supprimer, anonymiser). Bannière « restaurable jusqu'au … » si supprimé. |
| Bannière impersonation | Composant global (voir §7), monté au niveau layout racine. |

Appels via l'instance `api` partagée (cf. commit `8554083`) — jamais de fetch ad hoc.

## 11. Tests (avant « terminé »)

**Backend (scripts Python, pas de curl)** — login en tant que super-admin puis :
- succès : liste comptes, détail, suspend → login cible refusé, unsuspend → login OK,
  soft-delete → masqué + login refusé, restore → OK, anonymize → PII scrubée,
  impersonate → token valide portant `impersonated_by`.
- échecs/edge : non-superadmin sur `/admin/*` → 403 ; auto-suspension refusée ; suppression du
  dernier super-admin refusée ; impersonate d'un super-admin refusé ; double suspend idempotent ;
  `flask purge-deleted` anonymise bien un compte `deleted_at` de plus de 90 j et ignore les
  autres.

**Frontend** — routes `/admin/*` renvoient 200 pour un super-admin et redirigent sinon ;
build de production OK ; smoke test UI (liste, détail, action suspend, bannière impersonation).

## 12. Fichiers touchés (indicatif)

- **Backend** : `models/user.py`, `models/agency.py`, migration
  `add_account_moderation_fields`, `api/v1/admin/__init__.py` (+ `overview.py`, `accounts.py`,
  `activity.py`, `impersonation.py`), `api/v1/__init__.py` (enregistrement blueprint),
  `api/v1/auth.py` (enforcement login + émission token impersonation), `commands.py`
  (`purge-deleted`), `seed.py` (rôle superadmin), `.env.example` (`SUPERADMIN_EMAIL`), `README`.
- **Frontend** : `pages/admin/AdminLayout.jsx`, `AdminOverview.jsx`, `AdminAccounts.jsx`,
  `AdminAccountDetail.jsx`, `components/admin/ImpersonationBanner.jsx`,
  `components/auth/SuperAdminRoute.jsx`, `services/adminService.js`, câblage routeur + menu,
  `store/authStore` (slots token admin/impersonation).

---

## Annexe — décomposition globale (rappel)

0. ❤️ Cœur favori page détail — **livré**
1. 🛡️ Super-admin — **cette spec**
2. 👥 Équipes & sièges nominatifs (Pro 5 max / Entreprise illimité)
3. 📊 Dashboard enrichi (finance + marché)
4. 📄 Édition de contrats (Pro/Entreprise)
5. ⚖️ Juridique & notaires
6. 🔧 Référentiel artisans
7. 🛋️ Marketplace meubles & électroménager pour hôtes

Chaque brique suivante aura sa propre spec → plan → implémentation.
