# Spec — KYC réel (provider Didit), verrou avant signature

**Date :** 2026-08-30 · **Branche :** `feature/kyc-didit` (depuis `develop`)

## Objectif

Remplacer le KYC stub (`internal_kyc_verify`, validation manuelle admin — cf.
ADR-0005 « KYC/CIN : modèle + endpoint, sans provider Didit réel ») par une
vraie vérification d'identité via Didit (session hébergée + webhook signé),
et en faire un prérequis bloquant juste avant la signature électronique
(mandat, bail, compromis) — pas avant la publication d'annonce. Livrable 2 du
chantier stratégique « transaction 100% en ligne vérifiée » (brainstorming du
2026-08-30, suite du score de confiance déjà livré). Le score de confiance
(`services/trust-safety`) consomme déjà `identity.kyc.verified` — ce livrable
n'y touche pas, il en devient juste la vraie source.

## Déclencheur et parties concernées (décidés en brainstorming)

- KYC exigé **seulement avant signature**, pas avant publication d'annonce.
- Exigé des **deux parties** : acheteur/locataire ET vendeur/bailleur.
- Porté par `identity` (déjà propriétaire du domaine KYC) ; consommé par
  `rental` et `selling` comme garde avant création d'une `SignatureRequest`.

## Flux Didit

Session hébergée + webhook (modèle standard Didit, cf.
[docs.didit.me](https://docs.didit.me/getting-started/quick-start)) :

1. **Création de session** — `POST /identity/kyc/session` (authentifié) :
   appelle `POST https://verification.didit.me/v3/session/` (header
   `x-api-key`, body `{"workflow_id": DIDIT_WORKFLOW_ID, "vendor_data":
   user_id, "callback": <retour front>}`). Réponse Didit : `session_id`,
   `url`, `session_token`. On upsert `KycVerification(user_id, status=
   "pending", didit_session_id=session_id)` et on renvoie `{url}` au front
   pour redirection.
2. **Vérification côté Didit** — l'utilisateur complète OCR + liveness sur
   l'interface hébergée Didit (hors plateforme, rien à construire ici).
3. **Résultat — webhook (chemin principal)** — `POST /identity/kyc/webhook`
   (public, pas d'auth utilisateur) :
   - Vérifie `X-Signature-V2` (HMAC-SHA256 du corps brut avec
     `DIDIT_WEBHOOK_SECRET`), patron `services/payment/app/main.py` (bloc
     `_WEBHOOK_SECRET`) — rejette (401) si absent/invalide quand un secret
     est configuré.
   - Sur `webhook_type=status.updated` : résout `KycVerification` par
     `didit_session_id` (porté dans le payload). Si décision `Approved` →
     réutilise la logique de `internal_kyc_verify` (statut `verified`,
     `UserRO.is_verified=True`, `enqueue(identity.kyc.verified,
     {"user_id": ...})`). Si `Declined`/`Abandoned` → statut `rejected`.
   - Anti-rejeu : ne retraite pas une session déjà en statut terminal
     (`verified`/`rejected`), même patron que `_TERMINAL` côté `payment`.
4. **Résultat — pull (filet de sécurité, pas automatique)** — endpoint
   `GET /identity/kyc/session/{id}/refresh` (authentifié, propriétaire de la
   session) : appelle `GET .../v3/session/{id}/decision/` et applique la même
   logique de décision que le webhook. Déclenché manuellement par le front
   (bouton « Actualiser mon statut »), pas de tâche planifiée dans ce
   livrable — cf. hors périmètre.

## Verrou avant signature

Nouvel endpoint interne `GET /internal/kyc/status/{user_id}` sur `identity`
(patron `internal_agency_phone` — token interne, réponse `{"status": "none"
| "pending" | "verified" | "rejected"}`, dernier `KycVerification` de
l'utilisateur).

`rental` et `selling`, avant toute création de `SignatureRequest` (mandat,
bail, compromis) :
1. Résout `user_id` des deux parties (déjà présents sur le domaine : bailleur
   = `agency`/`owner_id`, locataire = `tenant_user_id` ; vendeur = partie
   agence, acheteur = `inq.buyer_party` selon le modèle `selling` existant).
2. Appelle `GET /internal/kyc/status/{user_id}` pour chacune.
3. Si l'une des deux n'est pas `verified` → 422 avec message explicite
   (« KYC requis avant signature — {rôle} n'a pas encore vérifié son
   identité »), pas d'appel au provider e-signature.

## Modèle de données

`KycVerification` (existant, `services/identity/app/models.py`) — ajout de
deux colonnes :
- `didit_session_id` (String, nullable, index) — clé de résolution du
  webhook.
- `decision` (JSON, nullable) — décision brute Didit conservée pour audit
  (pas re-servie au client, champ interne).

Migration incrémentale (`services/identity/db/migrate_didit.sql`, patron
`services/listing/db/migrate_condo.sql`) pour les bases existantes.

## Secrets & config

`DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET` en `.env`
gitignoré côté `identity`, jamais en dur, documentés dans `.env.example`.
Suite à un bug trouvé pendant l'audit e-signature (`.env.example` de
`selling` pointait vers le mauvais port), ce livrable ajoute un test qui
vérifie que chaque URL déclarée dans un `.env.example` est syntaxiquement
cohérente avec le service qu'elle nomme (pas une vérification réseau, juste
un garde-fou basique contre un copier-coller erroné).

Le champ `cin` existant sur `KycVerification` (saisie manuelle) est conservé
mais devient optionnel côté écriture — Didit ne garantit pas de renvoyer le
numéro CNIE en clair selon la configuration du workflow ; à confirmer une
fois le workflow Didit configuré côté compte, sans bloquer ce design.

## Frontend (les deux plateformes)

Bouton « Vérifier mon identité » (page profil / avant l'action de signature
si pas encore vérifié) → `POST /api/v1/identity/kyc/session` → redirection
`window.location = url` → retour sur la plateforme via `callback` → état
affiché : `pending` (« Vérification en cours, actualiser »), `verified`
(badge, cohérent avec le score de confiance déjà livré), `rejected`
(message + lien pour relancer une nouvelle session). Bouton « Actualiser mon
statut » visible en `pending` → appelle le endpoint de pull (§ Flux Didit
point 4).

## Repli manuel (conservé)

`internal_kyc_verify` (validation manuelle admin, existant) reste en place
pour un cas litigieux ou un contournement support — n'est plus le chemin
principal mais n'est pas supprimé.

## Tests

- **Backend `identity`** : création de session (mock httpx vers Didit,
  jamais de vrai appel réseau en test) ; webhook — signature valide/invalide/
  absente, décision Approved/Declined/Abandoned, anti-rejeu sur statut déjà
  terminal, résolution par `didit_session_id` inconnu (404 propre) ; pull —
  même logique de décision réutilisée (pas dupliquée) ; endpoint interne
  `/internal/kyc/status/{user_id}` — protégé par token interne, retourne
  `none` si aucune vérification.
- **Backend `rental`/`selling`** : création de `SignatureRequest` refusée
  (422) si une partie n'est pas `verified` (mock de l'appel interne KYC) ;
  autorisée si les deux le sont.
- **Config** : test de cohérence `.env.example` (nom de variable `*_URL`
  vs port attendu du service ciblé).
- **Front** : les trois états (pending/verified/rejected) rendus
  correctement ; i18n FR/AR.

## Hors périmètre (itération suivante)

- Filet de sécurité automatique (tâche planifiée qui pull les sessions
  `pending` trop anciennes) — on démarre avec le bouton manuel, on
  automatisera si l'usage réel montre que des webhooks se perdent.
- Correction du bug `.env.example` de `selling` trouvé lors de l'audit
  e-signature (ticket séparé — pas ce chantier).
- Chantier e-signature (3a9dSign vs provider certifié) — brainstorming
  séparé, à faire après ce livrable.
- Remplacement de la passerelle CMI simulée — troisième chantier du plan
  stratégique, non commencé.
