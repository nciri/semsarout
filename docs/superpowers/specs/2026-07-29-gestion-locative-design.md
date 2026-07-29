# Spec — Vague 3 : Gestion locative (service `rental`)

> Statut : conception validée (brainstorming 2026-07-29). Implémentation **découpée en phases**
> (voir §14). Fait suite au chantier « emails transactionnels » — l'ordonnanceur et les patrons
> de relance (dunning) construits précédemment sont réutilisés.

## 1. Contexte & problème

SemsarOut est aujourd'hui une plateforme **annonces + CRM + transactions**. Elle n'a **ni bail,
ni quittancement, ni comptabilité locative** : tout le §3 du catalogue d'emails
(`docs/emails/catalogue-emails.md`) est bloqué faute de domaine. `staymanager` couvre la
**location courte durée** (sync type Airbnb), pas la **gestion locative longue durée** (syndic /
administration de biens).

Objectif : créer le domaine **gestion locative** — mandats de gestion, baux, quittancement,
quittances, charges, dépôts, révision IRL, CRG — et **débrancher tous les emails associés**, plus
le domaine **dossier de candidature locative** (§2 du catalogue).

## 2. Décisions validées (brainstorming)

1. **Périmètre** : tout le domaine gestion locative + dossier de candidature + **UI back-office** +
   **PDF** (quittance, CRG), en un seul document de conception. Implémentation **phasée**.
2. **Personnes** : le locataire et le propriétaire bailleur sont des **`crm.Client`**
   (`client_type` = `tenant` / `landlord`). `rental` ne stocke que `client_id` ; l'email/nom est
   résolu par le service **notification** via `crm /internal/client/{id}` (helper existant). Pas de
   duplication. L'IBAN de virement vit sur le **Mandat** (arrangement bancaire), pas sur la personne.
3. **Quittancement** : échéances générées en **flux roulant mensuel** par l'ordonnanceur (pas de
   pré-génération de tout le bail).
4. **Paiement du loyer** : **saisie manuelle** par l'agence (v1). Le lien de paiement en ligne
   (via `payment`/CMI) et le débit récurrent sont **hors spec** (réalité marocaine = virement/espèces).
5. **Documents** : quittance de loyer et CRG générés en **PDF** (`reportlab`, patron `billing`).
   Les emails restent **HTML auto-suffisants** + lien (pas de pièce jointe — `send_email` est html-only).

## 3. Architecture

- Nouveau service souverain **`rental`** : schéma + rôle PostgreSQL `rental`, port **8518**.
- Patrons standard : `semsar_common`/`semsar_auth`/`semsar_events` — **outbox + relay + worker**,
  endpoints internes à `x-internal-token`, auth déléguée au BFF (`TRUST_GATEWAY_HEADERS`).
- BFF : `RENTAL_URL=http://localhost:8518`, route `/backoffice/gestion-locative/*` → `rental`.
- Gating abonnement : nouveau flag plan **`has_rental`** (Boolean, défaut False) + `require_rental`
  (parité `has_artisans`/`has_legal`). Ajout à `SubscriptionPlan` + `to_dict()`.
- Dépendances sortantes de `rental` : `IDENTITY_URL` (principal), `CRM_URL` (validation client),
  `LISTING_URL` (validation/titre du bien). Événementiel via `semsar.events`.

## 4. Modèle de données (schéma `rental`)

### 4.1 `Mandate` — mandat de gestion (agence ↔ propriétaire)
```
id, reference(unique), agency_id(idx), property_id(idx), landlord_client_id(idx),
mandate_type('gestion'|'location'), fee_percent(Numeric), landlord_iban(String, chiffré cible),
start_date, end_date, status('draft'|'active'|'expired'|'terminated'),
signed_at, expiry_notice_sent_at,          -- avis d'échéance de mandat (anti-doublon)
created_at, updated_at
```

### 4.2 `Lease` — bail (propriétaire ↔ locataire)
```
id, reference(unique), mandate_id(idx), property_id(idx), tenant_client_id(idx),
rent_amount(Numeric), charges_amount(Numeric), deposit_amount(Numeric),
deposit_returned_at, deposit_return_amount,
payment_day(Integer 1-28), start_date, end_date,
irl_index_ref(String), last_revision_at,   -- révision annuelle (indice de référence)
revision_notice_sent_at,                    -- avis de révision (anti-doublon)
status('draft'|'active'|'ended'|'terminated'), signed_at,
created_at, updated_at
```

### 4.3 `RentPeriod` — échéance de loyer / quittancement
```
id, lease_id(idx), period_label('Août 2026'), year, month,
rent_amount, charges_amount, total_amount, due_date,
status('pending'|'paid'|'partial'|'late'),
paid_amount, paid_at, payment_method('virement'|'cheque'|'especes'|'carte'),
receipt_number(unique, généré à l'encaissement),
reminder_count(Integer, défaut 0), last_reminder_at,   -- relance loyer impayé (dunning)
payout_sent_at,                                         -- avis de virement propriétaire
created_at
UNIQUE(lease_id, year, month)   -- idempotence de la génération roulante
```

### 4.4 `ChargeRegularization` — décompte annuel des charges
```
id, lease_id(idx), year, provisions_total, actual_total,
balance(Numeric, +=dû par locataire / -=à rembourser),
status('draft'|'sent'|'settled'), statement_sent_at, created_at
```

### 4.5 Dossier de candidature locative (§2 du catalogue)
`TenantApplication`
```
id, property_id(idx), agency_id(idx), lead_id(nullable), client_id(nullable),
applicant_name, applicant_email, applicant_phone,
monthly_income(Numeric), guarantor_name, guarantor_income,
status('received'|'reviewing'|'accepted'|'rejected'|'withdrawn'),
submitted_at, decided_at, decision_reason,
ack_sent_at, missing_docs_reminder_sent_at, decision_sent_at,   -- anti-doublon emails
created_at, updated_at
```
`ApplicationDocument`
```
id, application_id(idx), doc_type('cin'|'bulletin_salaire'|'contrat_travail'|'avis_impot'|'garant_*'),
status('pending'|'received'|'validated'|'rejected'), file_key(S3), created_at
```

### 4.6 Extension `crm.Client`
- `client_type` accepte désormais `tenant` et `landlord` (aujourd'hui : buyer/seller/…).
- Aucune colonne ajoutée : email/nom/téléphone déjà présents. Migration = documentation seule
  (valeurs applicatives, pas d'enum SQL contraint).

### 4.7 Projections locales (RO) — pour l'affichage sans appels N+1
- `PropertyRO(id, title, address, city)` — maintenue par `listing.*` (patron `crm`/`transactions`).
- `ClientRO(id, first_name, last_name, email, client_type)` — maintenue par `crm.client.*`.
  Utilisée par l'UI back-office ; le **chemin email** passe par `notification` → `crm` (pas de RO requise
  côté envoi, mais la RO évite les allers-retours dans les listes back-office).

## 5. Cycles de vie & états

**Mandat** : `draft` → (signature) `active` → (end_date atteinte) `expired` / (résiliation) `terminated`.
**Bail** : `draft` → (signature) `active` → (terme) `ended` / (résiliation) `terminated`.
**Échéance** : `generate` (ordonnanceur, 1×/mois) → `pending` → l'agence enregistre le paiement
(`POST /rent-periods/{id}/pay`) → `paid` (+ `receipt_number`, émet `rental.rent.paid`). Si non payée
à échéance : passe `late`, job de relance (dunning). Une fois encaissée : job d'avis de virement.
**Candidature** : `received` → `reviewing` → `accepted` / `rejected` / `withdrawn`.

## 6. Événements

**Émis par `rental`** (outbox → `semsar.events`) :
`rental.mandate.created`, `rental.mandate.signed`, `rental.lease.created`, `rental.lease.signed`,
`rental.lease.ended`, `rental.rent.paid`, `rental.deposit.returned`,
`rental.application.received`, `rental.application.decided`.

**Consommés par `notification`** (nouveaux bindings worker) :
`rental.rent.paid`, `rental.lease.signed`, `rental.mandate.signed`, `rental.deposit.returned`,
`rental.application.received`, `rental.application.decided`.

## 7. API

### 7.1 Back-office (`require_rental`, auth BFF) — `/backoffice/gestion-locative/*`
- Mandats : `GET /mandates`, `POST /mandates`, `GET/PATCH /mandates/{id}`, `POST /mandates/{id}/sign`.
- Baux : `GET /leases`, `POST /leases`, `GET/PATCH /leases/{id}`, `POST /leases/{id}/sign`,
  `POST /leases/{id}/revise` (nouvelle valeur de loyer), `POST /leases/{id}/deposit-return`.
- Quittancement : `GET /leases/{id}/rent-periods`, `POST /rent-periods/{id}/pay`,
  `GET /rent-periods/{id}/receipt.pdf` (quittance PDF).
- Charges : `GET/POST /leases/{id}/charge-regularizations`, `POST /charge-regularizations/{id}/send`.
- CRG : `GET /mandates/{id}/crg?period=YYYY-MM`, `GET /mandates/{id}/crg.pdf`.
- Candidatures : `GET /applications`, `POST /applications`, `GET/PATCH /applications/{id}`,
  `POST /applications/{id}/decide`, upload pièces `POST /applications/{id}/documents`.

### 7.2 Internes (ordonnanceur, `x-internal-token`)
- `POST /internal/rent-periods/generate` — crée l'échéance du mois pour chaque bail actif (idempotent).
- `GET /internal/rent-periods/due-reminders` + `POST /internal/rent-periods/{id}/reminder-sent`.
- `GET /internal/rent-periods/due-payouts` + `POST /internal/rent-periods/{id}/payout-sent`.
- `GET /internal/mandates/due-crg` + `POST /internal/mandates/{id}/crg-sent`.
- `GET /internal/mandates/due-expiry` + `POST /internal/mandates/{id}/expiry-notice-sent`.
- `GET /internal/leases/due-revision` + `POST /internal/leases/{id}/revision-notice-sent`.
- `GET /internal/leases/due-charge-regularization`.
- `GET /internal/applications/due-missing-docs-reminders` + `POST .../{id}/missing-docs-reminder-sent`.

## 8. Emails (chemins & gabarits)

Design SemsarOut existant (base.html, `_components`, icônes PNG hébergées Gmail-compat). Expéditeur
`contact@` (relationnel) sauf mention. Nouveaux gabarits + icônes lucide à générer (cairosvg 52px) :

**Événementiel (worker)**
| Email | Événement | Destinataire | Icône |
|---|---|---|---|
| Quittance de loyer | `rental.rent.paid` | locataire | `receipt-text` |
| Bail signé | `rental.lease.signed` | locataire + propriétaire | `file-check` |
| Mandat de gestion signé | `rental.mandate.signed` | propriétaire | `handshake` |
| Restitution du dépôt de garantie | `rental.deposit.returned` | locataire | `piggy-bank` |
| Accusé de réception candidature | `rental.application.received` | candidat | `clipboard-check` |
| Décision candidature (accept/refus) | `rental.application.decided` | candidat | `circle-check`/`circle-x` (conditionnel) |

**Temporel (ordonnanceur)**
| Email / action | Source | Destinataire | Icône |
|---|---|---|---|
| Génération des échéances | `rent-periods/generate` | — (pas d'email) | — |
| Relance loyer impayé (dunning J+3, +7j, max 3) | `rent-periods/due-reminders` | locataire | `credit-card` (réutilisé) |
| Avis de virement des loyers | `rent-periods/due-payouts` | propriétaire | `banknote` |
| Compte-rendu de gestion (CRG) | `mandates/due-crg` | propriétaire | `chart-column` |
| Avis d'échéance de mandat (J-60) | `mandates/due-expiry` | propriétaire | `calendar-clock` |
| Avis de révision de loyer (IRL) | `leases/due-revision` | locataire (+propriétaire) | `trending-up` |
| Régularisation des charges | `leases/due-charge-regularization` | locataire | `calculator` |
| Relance pièces manquantes (candidature) | `applications/due-missing-docs-reminders` | candidat | `paperclip` |

## 9. Couche documentaire (PDF)

- **Quittance de loyer** : `GET /rent-periods/{id}/receipt.pdf` — bailleur, locataire, bien, période,
  loyer + charges + total, mention « reçu pour solde de tout compte de la période », n° de quittance.
  Générée à l'encaissement (le PDF est calculé à la volée depuis la `RentPeriod`).
- **CRG** : `GET /mandates/{id}/crg.pdf?period=YYYY-MM` — loyers encaissés, honoraires de gestion
  (`fee_percent`), charges, net reversé au propriétaire, détail par échéance.
- Patron `reportlab` déjà utilisé par `billing` (`/invoices/{id}/pdf`). Réutiliser la mise en page.

## 10. UI back-office (React) — `/backoffice/gestion-locative/*`

Gating `has_rental` (parité artisans/legal). Écrans :
- **Mandats** : liste + création (propriétaire via recherche client, bien, honoraires %, IBAN, dates),
  détail, bouton « signer ».
- **Baux** : liste + création (mandat, locataire, loyer, charges, dépôt, jour d'échéance, IRL),
  détail, « signer », « réviser le loyer », « restituer le dépôt ».
- **Quittancement** : vue par bail des échéances (statut, montants), « enregistrer un paiement »
  (méthode + montant + date), téléchargement quittance PDF.
- **CRG** : consultation par mandat/période + téléchargement PDF.
- **Candidatures** : liste + détail (pièces & statut), boutons « accepter » / « refuser » (motif).

Menu back-office : entrée « Gestion locative » (visible si `has_rental`).

## 11. Ordonnanceur — nouveaux jobs

Ajouts à `services/notification/app/scheduler.py` (`run_once`), patron identique à l'existant
(poll endpoint interne → envoi → commit → marque `*-sent`, idempotent) :
`_job_generate_rent_periods`, `_job_rent_overdue_reminders`, `_job_landlord_payouts`,
`_job_crg_reports`, `_job_mandate_expiry_notices`, `_job_rent_revision_notices`,
`_job_charge_regularizations`, `_job_application_missing_docs`.
Env ajouté au lancement de l'ordonnanceur : `RENTAL_URL`. Récurrences : la plupart quotidiennes
(l'idempotence par flag `*_sent_at` / cadence gère la fréquence effective) ; génération d'échéances
et CRG bornées par période (année/mois) donc naturellement mensuelles.

## 12. Paiement du loyer (v1 = manuel)

`POST /rent-periods/{id}/pay {amount, method, paid_at}` → statut `paid`/`partial`, `receipt_number`
généré, émet `rental.rent.paid`. Aucune intégration passerelle en v1. Le lien de paiement en ligne
(service `payment`, événement `payment.completed` → marquer l'échéance) est un **point d'extension
documenté** mais hors spec.

## 13. Sécurité & conformité

- `landlord_iban` : chiffré au repos en cible (pgcrypto, comme `kyc.cin`) ; jamais loggé.
- Cloisonnement agence : toutes les requêtes back-office filtrées par `agency_id` du principal
  (parité `_bo_access`). Endpoints internes protégés par `x-internal-token`.
- Uploads pièces candidature : clés S3 scopées, `Content-Type` nosniff (patron `/uploads` durci).
- Emails : jamais de PII sensible (IBAN, revenus) dans le corps ; la quittance PDF est derrière auth.

## 14. Découpage en phases d'implémentation (plans séparés)

1. **Phase 1 — Socle `rental`** : service, schéma, `Mandate`/`Lease`, CRUD back-office, gating
   `has_rental`, BFF, events `mandate.*`/`lease.*`, projections RO. Emails : bail signé, mandat signé.
2. **Phase 2 — Quittancement** : `RentPeriod`, génération roulante, `/pay`, `rental.rent.paid`,
   quittance (email + PDF), relance loyer impayé (dunning), avis de virement propriétaire.
3. **Phase 3 — Périodique & révisions** : CRG (email + PDF), avis d'échéance de mandat, révision IRL,
   régularisation des charges, restitution du dépôt.
4. **Phase 4 — Candidature locative** : `TenantApplication`/`ApplicationDocument`, uploads, accusé,
   relance pièces manquantes, décision accept/refus.
5. **Phase 5 — UI back-office** : écrans React des phases 1-4.

Chaque phase : lint + typecheck + tests + build verts, test E2E email, un commit par changement logique.

## 15. Tests (avant « terminé », par phase)

- Unitaire/API : CRUD mandats/baux/échéances/candidatures, gating `has_rental`, cloisonnement agence.
- Génération roulante idempotente (contrainte unique `(lease_id, year, month)`).
- E2E email (patron établi) : seed mandat/bail/échéance/candidature avec `crm.Client` +addressé,
  run du job d'ordonnanceur, vérifier `notification_log = sent` + flag `*_sent_at`, 2ᵉ passage vide.
- PDF : génération quittance + CRG (montants cohérents, honoraires appliqués).

## 16. Fichiers touchés (indicatif)

- **Nouveau** : `services/rental/**` (app, models, db, main, relay, worker, util, pyproject, .env.example, README, db/schema.sql).
- `services/billing/app/models.py` (+`has_rental`) ; seed plans.
- `services/notification/app/{scheduler.py,worker.py,recipients.py,handlers.py}` + gabarits + icônes.
- `services/crm` : documentation `client_type` tenant/landlord (pas de schéma).
- `gateway/app/{config.py,main.py}` (+`RENTAL_URL`, route).
- `scripts/dev-mesh-up.sh` (service 8518, relay, worker, env ordonnanceur `RENTAL_URL`).
- `frontend/src/pages/backoffice/rental/**`, `App.jsx`, menu (phase 5).
- `docs/emails/catalogue-emails.md` (statuts §2/§3 → ✅), `docs/architecture-v2-status.md` (service rental).
