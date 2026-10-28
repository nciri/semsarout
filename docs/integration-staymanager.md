# Reprise des fonctionnalités StayManager dans SemsarOut

> Analyse du dépôt `hostify-0.1` (StayManager) et plan de reprise dans SemsarOut.
> Branche : `feat/staymanager-natif`. Dernière mise à jour : 2026-10-28.
>
> **État : les 8 lots du périmètre web sont livrés.** Le mobile est hors périmètre (décision
> du 2026-10-28) et aucune interface n'a été reprise : tous les écrans sont neufs, au thème
> du back-office SemsarOut. Reste ouvert, hors reprise : chiffrement au repos des
> identifiants de connecteurs (TTLock, ERP/CRM), fournisseur SMS à désigner, OCR des pièces
> d'identité, et signature du contrat de séjour via `contract` + `semsar_signing`.

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
| Serrures connectées TTLock, codes d'accès | `staymanager` : mode d'entrée par bien, codes par séjour | **couvert** (livré le 2026-10-28) |
| Vérification voyageur, OCR pièce d'identité | `staymanager` : lien d'enregistrement, occupants, pièces | **couvert sans OCR** (livré le 2026-10-28) |
| Contrats : gabarits, variables, PDF, signature | `contract` + `semsar_signing` (3a9dSign) | **couvert** — réutiliser, ne pas dupliquer |
| Messagerie automatisée (gabarits, règles, journal) | `notification` + `staymanager` : gabarits de l'agence, déclencheurs, journal | **couvert** pour les séjours (livré le 2026-10-28) |
| Équipes multi-rôles, invitations | `identity/team` : équipes, sièges, invitations | **partiel** — pas de matrice de droits par bien |
| Analytics, tableau de bord | `analytics` + tableau de bord back-office par activité | **couvert** |
| Abonnements : plans, essai, statuts | `billing` : plans, entitlements, prorata, changement programmé, reprise ; relances chez `notification` | **couvert** (livré le 2026-10-28) |
| Paiements Stripe / PayPal | `payment` : passerelle, webhooks | **partiel** — fournisseurs à brancher |
| Back-office admin SaaS (MRR, impersonation, cron) | `analytics` + `billing` + `notification` : MRR/ARR, incidents, tâches à la demande, journal | **couvert** (livré le 2026-10-28) |
| Onboarding gamifié (mascotte, badges) | `analytics` : étapes déduites de l'état réel, carte du tableau de bord | **couvert sans gamification** (livré le 2026-10-28) |
| Ménage : tâches, zones, rapports, stock | `staymanager` : tâches au départ, zones, rapports photo | **couvert** (livré le 2026-10-28) |
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
2. **Messagerie de séjour** — gabarits par agence et règles déclenchées (à la réservation,
   avant l'arrivée, après le départ), au-dessus de `notification`, sans second moteur
   d'envoi. *Livré sur cette branche.* Limites assumées : email seulement (aucun
   fournisseur SMS raccordé), et l'adresse du voyageur est saisie par l'agence — les
   plateformes ne la publient pas.
3. **Ménage** — tâches générées aux départs, zones, rapport avec photos, demandes de réassort.
   *Livré sur cette branche.* Deux écarts assumés : pas de catalogue de produits par agence
   (une demande de réassort dit en texte ce qui manque), et l'intervention technique reste
   un ordre de travail artisan dans `directory` — seule la rotation vit ici.
4. **Vérification du voyageur** — lien d'enregistrement privé (jeton haché, valable jusqu'au
   lendemain du départ), occupants déclarés, pièce d'identité déposée par le voyageur,
   verdict de l'agence. *Livré sur cette branche.* Deux écarts assumés : **pas d'OCR** (aucun
   moteur raccordé — le voyageur saisit, l'agence compare), et la signature du contrat de
   séjour reste du ressort de `contract` + `semsar_signing`, à brancher quand l'agence en
   voudra un.
5. **Serrures connectées** — mode d'entrée par bien (clés remises, code posé par l'agence,
   serrure TTLock), un seul code actif par séjour, révocation chez la serrure, et code
   reprise par la messagerie (`{{access_code}}`). *Livré sur cette branche.* Écarts assumés :
   les identifiants TTLock sont stockés en clair dans le service, comme les connecteurs
   ERP/CRM (chiffrement au repos à trancher pour les deux à la fois), et le mode manuel sert
   dès aujourd'hui puisque aucun compte TTLock n'est raccordé.
6. **Abonnements** — prorata à la montée de gamme (seule la différence du temps restant est
   facturée, l'échéance ne bouge pas), rétrogradation programmée au terme et annulable,
   reprise d'un abonnement résilié avant son terme, journal des mouvements. *Livré sur cette
   branche.* Les relances d'impayé existaient déjà (`notification`,
   `_job_unpaid_invoice_reminders`) : rien à reprendre. Écart assumé : pas de remboursement
   au prorata d'une rétrogradation — le mois est payé, le plan change au terme.
7. **Admin SaaS** — ARR à côté du MRR, liste des incidents de paiement avec leur motif,
   exécution manuelle des tâches planifiées et journal des envois. *Livré sur cette branche.*
   `notification` reçoit sa première route publique (super-admin) et entre dans la table de
   routage du BFF.
8. **Onboarding** — huit étapes déduites de l'état réel du compte (profil, premier bien,
   publication, barèmes, équipe, client, visite, abonnement), servies par `analytics` et
   affichées en carte sur le tableau de bord, masquable et disparaissant d'elle-même.
   *Livré sur cette branche.* La gamification (mascotte, badges) reste écartée : décision
   produit, pas reprise technique.
9. ~~Mobile~~ — **hors périmètre** : seul le backend de l'application web est repris
   (décision du 2026-10-28). L'application Expo n'est pas portée.

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
- **Aucune interface n'est reprise** : les écrans StayManager (React, thème propre) ne sont
  pas portés. Chaque lot reçoit des écrans neufs au thème du back-office SemsarOut, bâtis
  sur `components/kit.jsx` et `components/backoffice/ui.jsx`, dans le même patron que la
  gestion locative (layout à onglets + service JS dédié + clés i18n FR/AR).
- **Les URL iCal sont fournies par l'agence** : elles passent par le même garde-fou que les
  connecteurs ERP/CRM (https, hôte public, pas de redirection suivie).
