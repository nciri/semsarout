# Renouvellement et échec de paiement des abonnements — conception

Date : 2026-09-11. Branche : `feature/design3d-floorplan`.
Décisions de l'utilisateur, prises pendant la conception :

- un seul chantier : renouvellement + échec + réduction d'accès + surface d'administration ;
- « suspendre » signifie **accès réduit à la facturation**, login conservé ;
- l'accès est réduit **à l'épuisement des relances** ;
- l'« administrateur » à prévenir est le **superadmin de la plateforme**.

## 1. Constat de départ

Vérifié dans le code avant conception :

1. **Aucun cycle de renouvellement.** La seule facture d'abonnement créée l'est par
   `change_plan` (`services/billing/app/main.py`). Un abonnement n'est prolongé que sur
   `payment.completed` ; rien ne redemande jamais ce paiement à l'échéance.
2. **Aucun moyen de paiement stocké.** `Payment.payment_method` est une étiquette
   (`card` / `transfer`), sans jeton. « Retenter le paiement » ne peut donc pas être un
   prélèvement automatique : le système **redemande** à l'agence de payer.
3. **Passerelle CMI simulée** (`services/payment/app/gateway.py`). Le webhook ne porte que
   `status: failed`, sans motif.
4. **Un échec de paiement ne produit rien.** `payment_webhook` pose `p.status = "failed"`
   et n'émet aucun événement.
5. **`billing.invoice.created` est publié et consommé par personne**, contrairement à ce
   qu'annonce la docstring de `billing/app/main.py`.
6. **La relance existe.** L'ordonnanceur `notification/app/scheduler.py` envoie déjà trois
   relances (J+3, puis tous les 7 jours) pour **toute** facture `unpaid`, via
   `/internal/invoices/due-reminders` et `reminder-sent`. Il tourne comme unité systemd
   réelle (`semsar-notification-scheduler.service`), que `deploy-remote.sh` redémarre.
7. **La suspension existante bloque le login** : `AgencyRO.is_suspended` fait répondre
   403 à tous les comptes de l'agence (`identity/app/auth.py::_login_blocked`). Elle n'est
   donc PAS utilisée ici : l'agence doit pouvoir se connecter pour corriger son paiement.

## 2. Machine à états de l'abonnement

| Statut | Droits de plan | Transition sortante |
|---|---|---|
| `active` | pleins | échéance atteinte : facture de renouvellement émise → `past_due` |
| `past_due` | **pleins** (grâce) | paiement → `active` ; délai de grâce écoulé → `restricted` |
| `restricted` | **aucun**, login conservé | paiement → `active` |

`cancelled` et `incomplete` gardent leur sens actuel. **Un échec de paiement ne mène
jamais à `cancelled`** : il est consigné, la facture reste impayée, le statut ne bouge pas.

`past_due` rejoint `_ENTITLED_STATUSES` et `_REVOCABLE_ON_PERIOD_END`. `restricted` n'est
dans aucun des deux.

### Délai de grâce

Dérivé des constantes de relance existantes, sans nouvelle constante magique :

```
GRACE = _FIRST_REMINDER_DAYS + _MAX_REMINDERS * _REMINDER_INTERVAL_DAYS  # 3 + 3 × 7 = 24 jours
```

La troisième relance part à J+17 ; l'accès est réduit un intervalle plus tard, à J+24.
La dernière relance peut ainsi annoncer la date de réduction au lieu de coïncider avec elle.

### Révocation

`past_due` pose `features_until = issued_at + GRACE`. La révocation passe par le chemin
déjà construit pour A3 : à l'échéance, identity traite sa projection comme périmée,
réinterroge billing, `_agency_sub` → `_reconcile_expired`, qui passe l'abonnement en
`restricted` (et non `expired`) et émet `billing.subscription.activated` avec `features: []`.
Si billing est injoignable à ce moment, identity sert déjà `[]` (propriété de sûreté d'A3).

## 3. Composants

### 3.1 billing — émission du renouvellement

`POST /internal/subscriptions/issue-renewals` (jeton interne). Pour chaque abonnement
`active` dont `end_date <= now` et sans facture d'abonnement `unpaid` ouverte :

1. crée la facture de renouvellement (`invoice_type = "subscription"`, montant du plan
   et du cycle courants, `subscription_id` renseigné) ;
2. passe l'abonnement en `past_due`, `features_until = issued_at + GRACE` ;
3. émet `billing.invoice.created` et `billing.subscription.activated`
   (features inchangées + `features_until`), dans la même transaction.

Idempotent par construction : la présence d'une facture `unpaid` ouverte exclut
l'abonnement. POST et non GET : la mutation appartient à billing, l'ordonnanceur ne fait
que la réveiller.

### 3.2 notification — horloge et courriels

- `scheduler.py` : nouveau job `_job_subscription_renewals`, qui appelle l'endpoint 3.1.
  Aucune logique métier dans le job.
- `worker.py` : bindings `billing.invoice.created` et `payment.failed`.
  - `billing.invoice.created` → courriel « votre facture est disponible », lien de
    paiement. Effet de bord assumé : les factures de `change_plan` sont désormais annoncées
    elles aussi, ce qui est le comportement attendu d'une facture impayée.
  - `payment.failed` → courriel « votre paiement n'a pas abouti », avec le motif lisible
    et l'action à faire (corriger la carte, contacter la banque, réessayer).
- Les trois relances viennent du job de relance existant, sans modification.

### 3.3 payment — signalement de l'échec

Sur `status == "failed"`, `payment_webhook` émet `payment.failed` :

```
{payment_id, agency_id, user_id, purpose, reason_code, reason_label}
```

`reason_code` et `reason_label` sont lus dans le corps du webhook (`reason_code`,
`reason`). La passerelle simulée n'en fournit pas : `reason_code = "unknown"`. Le motif
circule de bout en bout ; il suffira que l'intégration CMI réelle le renseigne.

L'anti-rejeu existant (`_TERMINAL`) couvre aussi l'échec : un webhook d'échec rejoué
n'émet pas deux fois.

### 3.4 billing — consommation de l'échec et du paiement

- Binding `payment.failed` : consigne `last_payment_failure_at` et
  `last_payment_failure_reason` sur l'abonnement courant de l'agence. **Ne change pas le
  statut.**
- `payment.completed` (existant, `_create_or_extend`) : l'abonnement courant est retrouvé
  même en `past_due` ou `restricted` (aujourd'hui seul `active` l'est, ce qui créerait une
  seconde ligne). Il est prolongé depuis son `end_date`, repasse en `active`, la facture
  ouverte passe `paid`, et l'événement porte `features_until: None`.
- `/my-subscription` expose `status`, `features_until`, `last_payment_failure_at`,
  `last_payment_failure_reason`, et la référence de la facture ouverte.

Migration `services/billing/db/migrate_payment_failure.sql` (colonnes nullables, idempotente),
ajoutée à `MIGRATIONS` de `deploy-remote.sh` — le garde-fou d'A5 l'exige.

### 3.5 frontend agence

- `pages/dashboard/Subscription.jsx` :
  - `past_due` : bandeau avec la date de réduction d'accès, le dernier motif d'échec s'il
    existe, et un bouton « Payer maintenant » vers le parcours de paiement existant ;
  - `restricted` : même bandeau, formulé comme un accès réduit, avec le même bouton.
- Tableau de bord : si l'abonnement est `restricted`, les routes hors facturation
  renvoient vers la page d'abonnement. C'est un confort d'interface : le blocage réel est
  côté serveur (`features: []`, `require_feature`).
- Libellés FR et AR, aucun identifiant technique dans les messages.

### 3.6 superadmin

- `/internal/subscriptions/stats` ajoute `past_due` et `restricted` (nombres).
- `AdminOverview` : une carte « Impayés » (en grâce / accès réduit).
- `AdminAccounts` : filtre et badge par statut d'abonnement (déjà présent dans `_sub_dict`).

Pas de notification poussée par superadmin : l'état est surfacé par requête.

## 4. Invariants

- I1 — Un échec de paiement ne rend jamais un abonnement `cancelled`.
- I2 — `past_due` reste entitlé jusqu'à `features_until` ; au-delà, aucun droit n'est
  servi, billing joignable ou non.
- I3 — `restricted` n'empêche jamais le login.
- I4 — Émettre le renouvellement deux fois ne crée pas deux factures.
- I5 — Un paiement reçu en `past_due` ou `restricted` prolonge l'abonnement existant,
  sans créer de seconde ligne.
- I6 — Le motif d'échec atteint l'agence par courriel et par sa page d'abonnement.

## 5. Tests attendus

- billing : émission idempotente (I4) ; `past_due` → `restricted` à l'échéance (I2) ;
  `payment.failed` ne change pas le statut (I1) ; `payment.completed` en `restricted`
  prolonge la même ligne (I5).
- identity : `past_due` échu + billing injoignable → `[]` (déjà couvert par A3, à étendre au
  cas `past_due`).
- payment : `payment.failed` émis une seule fois, motif `unknown` par défaut.
- notification : le job appelle l'endpoint ; les deux handlers produisent un courriel.
- frontend : bandeaux `past_due` / `restricted` ; redirection en `restricted`.
- infra : la migration figure dans `MIGRATIONS` (garde-fou existant).

## 6. Hors périmètre

- Motifs bancaires réels (carte refusée, autorisation 3-D Secure échouée) : exigent
  l'intégration CMI réelle. Le câblage est prêt.
- Moyen de paiement enregistré et prélèvement automatique.
- Suspension bloquant le login.
- Notification poussée à chaque superadmin.
- Abonnements annuels : le mécanisme est identique, seul le montant et la durée changent
  (déjà gérés par `billing_cycle`).
