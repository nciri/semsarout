# Reprise des fonctionnalités StayManager dans SemsarOut

> Analyse du dépôt `hostify-0.1` (StayManager) et plan de reprise dans SemsarOut.
> Branche : `feat/staymanager-natif`. Dernière mise à jour : 2026-10-28.

## Ce que StayManager est, en chiffres

| Partie | Volume |
|---|---|
| Backend Flask (`backend/app`) | 27 461 lignes — 46 modèles, 35 modules de routes, 21 services, 29 utilitaires |
| Front React (`frontend/src`) | 37 821 lignes — 155 fichiers, 27 pages |
| Application mobile Expo (`mobile-app/src`) | 15 275 lignes — 75 fichiers |

Produit : gestion de **location courte durée** (conciergerie). Multi-plateformes
(Airbnb, Booking, VRBO) par iCal, serrures connectées, vérification d'identité des
voyageurs, contrats, messagerie automatisée, ménage, abonnements SaaS par bien.

SemsarOut est un produit différent : **transaction et gestion longue durée** pour agences
(annonces, leads, visites, transactions, mandats, baux, quittances). Les deux se recouvrent
sur l'infrastructure (comptes, équipes, notifications, abonnements, i18n), pas sur le métier.

## Recouvrement, fonctionnalité par fonctionnalité

Trois états : **déjà couvert** (ne rien reprendre), **partiel** (compléter l'existant),
**absent** (à construire).

| StayManager | SemsarOut aujourd'hui | État |
|---|---|---|
| Auth (Google, e-mail, SMS), rôles, profil | `identity` : JWT RS256, rôles, équipes, sièges, KYC Didit | **couvert** — ne pas reprendre Firebase |
| Propriétés, photos, adresse | `listing` : CRUD, modération, médias, prix jour/semaine/mois | **couvert** |
| Réservations + sync iCal multi-OTA | `staymanager` : miroir des réservations d'un compte StayManager externe | **partiel** — rien de natif sans ce compte |
| Serrures connectées TTLock, codes d'accès | — | **absent** |
| Vérification voyageur, OCR pièce d'identité | `identity` (KYC Didit, pour les comptes) | **partiel** — rien côté voyageur d'un séjour |
| Contrats : gabarits, variables, PDF, signature | `contract` + `semsar_signing` (3a9dSign) | **couvert** — réutiliser, ne pas dupliquer |
| Messagerie automatisée (gabarits, règles, journal) | `notification` : gabarits Jinja2, ordonnanceur, journal | **partiel** — pas d'éditeur par agence ni de règles |
| Équipes multi-rôles, invitations | `identity/team` : équipes, sièges, invitations | **partiel** — pas de matrice de droits par bien |
| Analytics, tableau de bord | `analytics` + tableau de bord back-office par activité | **couvert** |
| Abonnements : plans, essai, statuts | `billing` : plans, entitlements, factures de commission | **partiel** — ni relances (dunning), ni prorata, ni portail libre-service |
| Paiements Stripe / PayPal | `payment` : passerelle, webhooks | **partiel** — fournisseurs à brancher |
| Back-office admin SaaS (MRR, impersonation, cron) | `audit`, écrans admin partiels | **partiel** |
| Onboarding gamifié (mascotte, badges) | — | **absent** |
| Ménage : tâches, zones, rapports, stock | — | **absent** |
| Agents IA | — | **absent** |
| API partenaires, clés d'API, webhooks sortants | `partner` : auth partenaire, livraison, webhooks | **couvert** |
| Connecteurs ERP/CRM | `agency` : Odoo, SAP, Salesforce, HubSpot, Zoho | **couvert** (livré le 2026-10-28) |
| i18n FR / AR | i18next, parité de clés testée | **couvert** (StayManager a aussi EN) |
| Workers de fond | 66 unités systemd, outbox + consumers | **couvert** |
| Application mobile | — | **absent** |

## Ordre de reprise

Le métier courte durée tient à une chaîne : un séjour entre par un calendrier, puis tout
s'y rattache (code d'accès, message, ménage, contrat). Reprendre dans cet ordre évite de
construire des écrans qui n'ont encore rien à montrer.

1. **Séjours et calendriers iCal** — sources par bien, synchronisation, réservations
   natives, détection des chevauchements. *Livré sur cette branche.*
2. **Messagerie de séjour** — gabarits par agence et règles déclenchées (J-1 arrivée,
   J+1 départ), au-dessus de `notification`, sans second moteur d'envoi.
3. **Ménage** — tâches générées aux départs, zones, rapport avec photos, demandes de stock.
4. **Vérification du voyageur** — lien d'enregistrement, pièce d'identité, OCR, et
   signature du contrat via `contract` + `semsar_signing` (rien à réécrire).
5. **Serrures connectées** — TTLock : identifiants chiffrés par agence, génération et
   révocation des codes par séjour.
6. **Abonnements** — relances d'échec de paiement, prorata, portail libre-service,
   au-dessus de `billing` et `payment`.
7. **Admin SaaS** — MRR/ARR, incidents de paiement, exécution manuelle des tâches planifiées.
8. **Onboarding** — étapes calculées sur l'état réel du compte ; la gamification (mascotte,
   badges) est une décision produit, pas une reprise technique.
9. **Mobile** — à trancher : application dédiée ou PWA du back-office.

## Décisions prises pour éviter les doublons

- **Une seule table de réservations** : `staymanager.staymanager_reservation` sert le miroir
  d'un compte StayManager externe *et* les séjours natifs venus d'iCal. Les colonnes propres
  au miroir deviennent facultatives ; une colonne `source` dit d'où vient la ligne.
- **Pas de second service** : les séjours vivent dans `services/staymanager`, qui portait
  déjà les réservations ; le nom reste, son périmètre s'élargit.
- **Pas de second moteur de PDF, de signature, d'e-mail ni de gabarits** : `contract`,
  `semsar_signing` et `notification` existent et sont utilisés tels quels.
- **Pas de reprise de Firebase, Keycloak ni Twilio** : `identity` fait l'authentification,
  et aucun fournisseur SMS n'est raccordé côté SemsarOut (décision à part).
- **Les URL iCal sont fournies par l'agence** : elles passent par le même garde-fou que les
  connecteurs ERP/CRM (https, hôte public, pas de redirection suivie).
