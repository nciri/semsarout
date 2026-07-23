# Spec — Équipes & sièges nominatifs (Pro / Entreprise)

**Date :** 2026-07-23
**Brique :** 2 / 8 de la refonte
**Statut :** validé, prêt pour le plan d'implémentation
**Dépend de :** brique 1 (super-admin) — modération, impersonation.

---

## 1. Contexte & problème

Aujourd'hui : un membre = un `User` avec un unique `agency_id` ; les rôles/permissions par agence
existent et fonctionnent ; la page backoffice **« Équipe »** liste les membres et propose
« Inviter un membre » — mais ce bouton appelle `POST /backoffice/users/invite`, **un endpoint qui
n'existe pas côté backend** (fonction cassée). Il n'y a **ni modèle `Team`, ni notion de sièges,
ni limite par plan**.

La brique 2 construit le vrai système : **sièges nominatifs** (comptes membres avec limite selon
le plan) + **équipes-étiquettes** (regroupement léger, sans cloisonnement de données), et répare
le flux d'invitation.

## 2. Décisions validées

| Sujet | Décision |
|-------|----------|
| Nature d'une « équipe » | Simple **étiquette/groupe** rattachée à l'agence — **aucun** cloisonnement de données |
| Onboarding membre | **Invitation par lien token** (le membre définit son mot de passe) |
| Limite Pro | **5 membres invités EN PLUS** du propriétaire (owner non décompté) |
| Limite Entreprise | Membres **illimités** |
| Nombre d'équipes | Pro = **1**, Entreprise = **illimité**, autres plans = 0 |
| Droit de gérer l'équipe | **Propriétaire** du compte **+** rôles portant la permission `team.manage` |
| Downgrade en surcapacité | **Bloqué** tant que le nb de membres dépasse la nouvelle limite |
| Override super-admin | Via **impersonation** (brique 1) — pas de nouvelle UI dédiée |

## 3. Réalité e-mail (contrainte)

Aucun provider SMTP n'est câblé (`auth.py:forgot_password` ne fait que loguer le lien en dev via
`DEBUG_EMAIL_TO_LOG`). L'invitation suit donc **le même modèle** :
- On génère un token, on stocke **uniquement son hash** (SHA-256), on expose un **lien
  d'acceptation**.
- L'UI admin affiche le lien d'invitation **copiable** → livraison manuelle possible immédiatement.
- Un envoi e-mail best-effort est tenté **si** `MAIL_*` est configuré (helper `send_email`
  centralisé, no-op sinon) ; sinon le lien copiable est le mécanisme de livraison.

C'est cohérent avec le choix « invitation par email » tout en restant fonctionnel sans SMTP.

## 4. Modèle de données

### 4.1 `SubscriptionPlan` (ajouts — `backend/app/models/subscription.py`)
| Colonne | Type | Rôle | starter / pro / enterprise |
|---------|------|------|----------------------------|
| `max_seats` | Integer, default 0 | membres invités **hors owner** ; -1 = illimité | 0 / **5** / **-1** |
| `max_teams` | Integer, default 0 | équipes-étiquettes ; -1 = illimité | 0 / **1** / **-1** |

Ajoutés à `to_dict()`.

### 4.2 `Agency` (ajout — `backend/app/models/agency.py`)
- `owner_id` (FK `users.id`, nullable) : titulaire du compte, **ne consomme pas de siège**.
- Backfill migration : pour chaque agence, `owner_id` = le membre portant le rôle agence de plus
  haut niveau (sinon le membre le plus ancien). Documenté dans la migration.

### 4.3 `Team` (nouveau — `backend/app/models/team.py`)
`id`, `agency_id` (FK, index), `name` (String 80), `created_at`. `to_dict()` renvoie
`{id, agency_id, name, members_count}`. Contrainte d'unicité `(agency_id, name)`.

### 4.4 `User` (ajout — `backend/app/models/user.py`)
- `team_id` (FK `teams.id`, nullable). Un membre appartient à **au plus une** équipe. Ajouté à
  `to_dict()` (`team_id`).

### 4.5 `Invitation` (nouveau — `backend/app/models/invitation.py`)
`id`, `agency_id` (FK), `email` (String 120), `role_id` (FK nullable), `team_id` (FK nullable),
`token_hash` (String 64, index), `status` (`pending`/`accepted`/`revoked`/`expired`),
`invited_by` (FK users), `expires_at`, `created_at`, `accepted_at`. `to_dict()` **n'expose
jamais** le token brut. Contrainte : une seule invitation `pending` par `(agency_id, email)`.

### 4.6 Migration
`add_teams_and_seats` : colonnes plan (`max_seats`,`max_teams`), `agencies.owner_id` + backfill,
`users.team_id`, tables `teams` et `invitations`. `down_revision` = tête courante (brique 1 :
tête après `5f697ec`). Rétro-compatible (nouveaux champs nullable / défaut 0).

## 5. Service `seats` (source unique de vérité — `backend/app/services/seats.py`)

- `seat_owner_id(agency)` → `agency.owner_id`.
- `seats_used(agency)` = (membres `User` de l'agence **hors owner**, non supprimés) **+**
  invitations `pending` non expirées. *(Les pending comptent → pas de sur-invitation.)*
- `seats_limit(agency)` → plan `max_seats` (-1 = ∞).
- `can_invite(agency)` → `limit == -1 or seats_used < limit`.
- `teams_used(agency)` / `teams_limit(agency)` / `can_create_team(agency)`.
- `member_count(agency)` (owner inclus) — utilisé pour le blocage de downgrade.
- Toutes les vérifs d'enforcement passent par ce module (testable isolément).

## 6. Permissions

- Nouvelle permission `team.manage` (module `team`), seedée et attribuée par défaut au rôle
  `admin` d'agence.
- Helper `can_manage_team(user, agency)` = `user.id == agency.owner_id` **ou** un rôle de l'user
  (dans cette agence) porte `team.manage`. Le super-admin passe par l'impersonation (devient
  l'owner) — pas de cas particulier ici.

## 7. API

### 7.1 Backoffice (agence — `require_auth`, cloisonné par `g.agency_id`)
Nouveau module `backend/app/api/v1/backoffice/team.py` (routes sous `/backoffice`) :
- `GET /backoffice/team` → `{owner, members:[{user, role, team_id}], teams:[...], invitations:[pending...], seats:{used,limit}, teams_quota:{used,limit}}`.
- `POST /backoffice/team/invitations` `{email, role_id?, team_id?}` → refuse `409` si `!can_manage_team` (403) ou `!can_invite` (409, message upgrade) ou email déjà membre/invité ; crée l'`Invitation`, tente `send_email`, renvoie **le lien d'acceptation** (pour copie).
- `POST /backoffice/team/invitations/<id>/resend` → régénère token + expiry, re-tente l'email, renvoie le lien.
- `DELETE /backoffice/team/invitations/<id>` → `status='revoked'`.
- `POST /backoffice/teams` `{name}` → refuse `409` si `!can_create_team` ; crée l'équipe.
- `PUT /backoffice/teams/<id>` `{name}` · `DELETE /backoffice/teams/<id>` (les membres passent `team_id=NULL`, pas de suppression de membre).
- `PUT /backoffice/team/members/<user_id>` `{team_id?, role_id?}` → ré-affecte équipe/rôle (jamais l'owner rétrogradé sous lui-même).
- `DELETE /backoffice/team/members/<user_id>` → retire le membre de l'agence (`agency_id=NULL`, `team_id=NULL`) ; **interdit** sur l'owner (409).
Toutes gardées par `can_manage_team` (sauf le `GET` lisible par tout membre de l'agence).

### 7.2 Public (invitation — `backend/app/api/v1/invitations.py`)
- `GET /invitations/<token>` → valide (hash, non expirée, `pending`) → `{agency_name, email, role_name}` ou `410/404`.
- `POST /invitations/<token>/accept` `{first_name, last_name, password}` → crée le `User`
  (`agency_id`, `role`, `team_id` de l'invitation, `is_active=True`, `is_verified=True`), marque
  `accepted` + `accepted_at`, renvoie des tokens JWT (auto-login). Re-vérifie `can_invite` au
  moment de l'accept (garde-fou anti-course sur le dernier siège). Si l'email correspond déjà à un
  `User`, rattache ce compte à l'agence au lieu d'en créer un.

### 7.3 Blocage de downgrade (`backend/app/api/v1/billing.py:change_plan`)
Avant `subscription.plan_id = new_plan.id` (≈ ligne 404), en évaluant les quotas **du nouveau
plan** via le service `seats` : si `new_plan.max_seats != -1` et le nombre de membres actifs hors
owner dépasse `new_plan.max_seats`, refuser `409` « Retirez d'abord X membres pour passer à ce
plan ». Idem si `new_plan.max_teams != -1` et `teams_used(agency) > new_plan.max_teams`. *(On
compte ici les membres réels hors owner — pas les invitations en attente ; on peut ajouter un
helper `active_member_seats(agency)` au service `seats` pour cette évaluation, distinct de
`seats_used` qui inclut les pending pour l'enforcement d'invitation.)*

## 8. E-mail — helper centralisé
`backend/app/services/mailer.py` : `send_email(to, subject, body, html=None)` → si `MAIL_SERVER`
configuré, envoie via `flask_mail` ; sinon log (comme le reset). Le flux invitation ne dépend
JAMAIS du succès de l'envoi : le lien copiable reste la source de vérité. (On peut aussi
rebrancher le reset password dessus, mais hors périmètre — ne pas le faire ici.)

## 9. Front

### 9.1 Refonte page backoffice « Équipe » (`frontend/src/pages/backoffice/Team.jsx`)
- En-tête avec **jauge de sièges** « membres : 3 / 5 » (ou ∞) et **quota d'équipes**.
- Bouton « Inviter un membre » → modale (email + rôle + équipe) → à la création, **affiche le lien
  d'invitation copiable** (toast + champ copiable), plus « invitation envoyée ».
- Section **invitations en attente** : email, date, expiration, actions relancer / révoquer (avec
  lien copiable au resend).
- Liste des membres groupés par équipe ; ré-affecter équipe/rôle ; retirer un membre.
- **Gestion des équipes** (créer/renommer/supprimer) visible seulement si `max_teams != 0` ;
  bouton « créer une équipe » désactivé au plafond avec message upgrade.
- Boutons d'action masqués/désactivés si l'utilisateur courant n'a pas `team.manage`.
- Câblage via l'instance `api` partagée + un `teamService`. **Supprime** l'appel cassé
  `POST /backoffice/users/invite`.

### 9.2 Page publique d'acceptation (`frontend/src/pages/auth/AcceptInvitation.jsx`)
Route `/invitation/:token` : charge `GET /invitations/:token`, affiche agence + email, formulaire
(nom, prénom, mot de passe + confirmation, indicateur requis conforme au skill form-design), POST
accept → connexion + redirection `/backoffice`. Gère token invalide/expiré (message clair + lien
connexion).

## 10. Seed
- `starter`: `max_seats=0, max_teams=0` ; `pro`: `5, 1` ; `enterprise`: `-1, -1`.
- Backfill `owner_id` des agences seedées (admin de l'agence).
- Permission `team.manage` seedée + attribuée au rôle `admin`.

## 11. Tests (avant « terminé »)

**Backend (scripts Python)** — pour une agence Pro et une Entreprise :
- invite → `GET /invitations/token` valide → accept → le membre peut se **connecter** et porte le
  bon `agency_id`/rôle/`team_id` ;
- Pro : 5 invites OK, la 6ᵉ → `409` (owner non décompté) ; une invitation `pending` **consomme** un
  siège (inviter 5 en pending puis un accept ne libère pas de siège) ; Entreprise : > 5 OK ;
- révoquer une invitation **libère** un siège ;
- équipes : Pro crée 1 équipe, la 2ᵉ → `409` ; Entreprise multiples OK ;
- `can_manage_team` : un membre sans `team.manage` → `403` sur invite/teams ;
- downgrade Entreprise→Pro avec trop de membres → `409` ; avec assez peu → OK ;
- accept re-vérifie le siège (course sur le dernier siège) → `409` si plein entre-temps ;
- suppression de l'owner interdite (`409`).

**Frontend** — routes `/backoffice/equipe` et `/invitation/:token` renvoient 200 ; build prod OK ;
smoke test : inviter (lien copiable affiché), accepter dans un autre navigateur, membre connecté,
jauge de sièges à jour.

## 12. Fichiers touchés (indicatif)
- **Backend** : `models/subscription.py`, `models/agency.py`, `models/user.py`,
  `models/team.py` (new), `models/invitation.py` (new), `models/__init__.py`, migration
  `add_teams_and_seats`, `services/seats.py` (new), `services/mailer.py` (new),
  `api/v1/backoffice/team.py` (new) + enregistrement, `api/v1/invitations.py` (new) +
  enregistrement, `api/v1/backoffice/roles.py` (permission `team.manage` prise en compte),
  `api/v1/billing.py` (blocage downgrade), `seed.py` / `seed_backoffice.py`, `scripts/verify_team_*.py`.
- **Frontend** : `pages/backoffice/Team.jsx` (refonte), `pages/auth/AcceptInvitation.jsx` (new),
  `services/teamService.js` (new), câblage routeur (`/invitation/:token`), `services/api.js` (aucun
  changement attendu).

---

## Annexe — décomposition globale (rappel)
0. ❤️ Cœur favori — livré · 1. 🛡️ Super-admin — livré · **2. 👥 Équipes & sièges — cette spec** ·
3. 📊 Dashboard enrichi · 4. 📄 Contrats · 5. ⚖️ Juridique & notaires · 6. 🔧 Artisans ·
7. 🛋️ Marketplace meubles.
