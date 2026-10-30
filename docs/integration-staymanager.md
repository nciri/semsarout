# Reprise des fonctionnalités StayManager dans SemsarOut

> Analyse du dépôt `hostify-0.1` (StayManager) et plan de reprise dans SemsarOut.
> Branche : `feat/staymanager-natif`. Dernière mise à jour : 2026-10-29.
>
> **État : les 8 lots du périmètre web sont livrés, puis 4 lots d'approfondissement**
> (fiche de séjour et saisie directe, liens filtrés entre écrans, équipes métier,
> contrat de séjour signé par le voyageur). Le mobile est hors périmètre (décision du
> 2026-10-28) et aucune interface n'a été reprise : tous les écrans sont neufs, au thème
> du back-office SemsarOut. Reste ouvert, hors reprise : chiffrement au repos des
> identifiants de connecteurs (TTLock, ERP/CRM), fournisseur SMS à désigner, OCR des pièces
> d'identité, et signature avancée via `semsar_signing` (l'acceptation en ligne horodatée
> est livrée).

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
| Réservations + sync iCal multi-OTA | `staymanager` : séjours natifs iCal, saisie directe, fiche, calendrier mensuel | **couvert** (livré le 2026-10-29) |
| Serrures connectées TTLock, codes d'accès | `staymanager` : mode d'entrée par bien, codes par séjour | **couvert** (livré le 2026-10-28) |
| Vérification voyageur, OCR pièce d'identité | `staymanager` : lien d'enregistrement, occupants, pièces | **couvert sans OCR** (livré le 2026-10-28) |
| Contrats : gabarits, variables, PDF, signature | `contract` : modèle `stay`, variables du séjour, PDF, signature du voyageur depuis son lien | **couvert** (livré le 2026-10-29) |
| Messagerie automatisée (gabarits, règles, journal) | `notification` + `staymanager` : gabarits de l'agence, déclencheurs, journal | **couvert** pour les séjours (livré le 2026-10-28) |
| Équipes multi-rôles, invitations | `identity/team` : équipes typées, rôles du métier, renforts, + bien rattaché à une équipe et performance dans `staymanager` | **couvert** (livré le 2026-10-29) |
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

### Approfondissement (2026-10-29)

Quatre lots répondant à une relecture de l'écran des séjours : « trop simple, ne correspond
pas à ce qui a été fait dans StayManager ».

10. **Fiche de séjour, saisie directe et calendrier** — une page par séjour (occupants,
    ménage, code d'entrée, messages, conflits), la réservation conclue hors plateforme
    (`source = manual`, modifiable, annulable), et une grille d'occupation mensuelle par
    bien. Un séjour venu d'un calendrier reste non modifiable : la plateforme le réécrit à
    chaque synchronisation.
11. **Liens filtrés entre écrans** — chaque chiffre mène aux lignes qu'il compte. L'aperçu
    des séjours, le bandeau de la gérance et les widgets du tableau de bord pointent vers
    des listes déjà filtrées, que les écrans cibles lisent dans l'URL (`vue`, `statut`,
    `filtre`, `bien`, `equipe`, `tache`, `sejour`).
12. **Équipes métier** — `identity` : métier d'équipe issu d'un catalogue fixe (ménage,
    maintenance, conciergerie, commerciale, générale), couleur, description, et renforts
    avec le rôle tenu dans l'équipe d'accueil. `staymanager` : un bien est confié à une
    équipe, la tâche de ménage en hérite, et un onglet montre ce que chaque équipe a
    réellement abattu sur trente jours. Écart assumé : le catalogue n'est pas éditable par
    l'agence (StayManager laissait cloner des types) — les libellés sont traduits FR/AR, et
    une taxonomie libre obligerait chaque agence à inventer son vocabulaire.
13. **Contrat de séjour** — `contract` reçoit un type de document `stay` et les variables du
    séjour (`{{stay_check_in}}`, `{{stay_nights}}`, `{{guest_name}}`…) ; le contrat est
    généré depuis la fiche, finalisé en PDF, puis **signé par le voyageur depuis son lien
    d'enregistrement**. La signature est une acceptation horodatée (nom saisi, date, IP
    consignés) ; le parafeur `semsar_signing` reste disponible pour un circuit avancé.

14. **Rubriques rangées par rôle** — le rang de sept onglets mettait sur le même plan des
    choses de niveaux différents. Une colonne les sépare : *Réservations* (planning,
    calendrier : deux vues des mêmes séjours), *Exploitation* (ménage, messages : n'existe
    que s'il y a des séjours, d'où `stays_total` dans l'aperçu et les rubriques éteintes
    quand il vaut zéro), *Réglages par bien* (accès, équipes : les prérequis, toujours
    ouverts). Les calendriers connectés quittent la colonne pour une icône de l'en-tête, à
    côté de la synchronisation qui s'en sert : ils alimentent les séjours, ils n'en sont pas
    une vue.

15. **Branchement multi-plateformes en un écran** — un bien est publié sur plusieurs canaux à
    la fois ; l'écran des calendriers présente donc toutes les plateformes ensemble, un champ
    d'URL iCal par plateforme avec sa marque à gauche, et n'envoie que les champs remplis. Le
    service reste unitaire (un calendrier par couple bien/plateforme) : la boucle est côté
    front, qui garde les URL refusées avec leur raison et efface celles qui sont passées.
    Les plateformes déjà branchées sur le bien choisi s'affichent fermées, pour ne pas faire
    buter l'agence sur le 400 de doublon.

16. **Modèles de messages repris de StayManager** — les textes de StayManager
    (`app/i18n/{fr,ar}.json`, clés `<type>_name` / `<type>_content`) reviennent en modèles
    prêts à l'emploi que l'agence installe d'un clic, en FR et en AR : confirmation,
    bienvenue, instructions d'arrivée (code d'entrée ou remise des clés), message pendant le
    séjour, rappel de départ, demande d'avis. Les variables sont ramenées à ce qu'un séjour
    porte vraiment (`property_name` devient `property_title`, `host_name` devient
    `agency_name`, les heures deviennent les dates du séjour). Deux déclencheurs manquaient
    pour les placer : `after_check_in` et `before_check_out` rejoignent `messages.TRIGGERS`.
    `needs_access` ne retient plus que `{{access_code}}` : un modèle de remise des clés
    attendait sinon un code qui ne viendrait jamais.
    Non reprises : les notifications ménage et maintenance (destinées à l'équipe, pas au
    voyageur — ce sont les tâches d'exploitation) et les messages de vérification d'identité
    et de contrat, dont le lien est un jeton à usage unique que le moteur de gabarits ne sait
    pas fabriquer.

17. **Une page « Tiers » au lieu de deux pages et quatre onglets** — notaires et dossiers
    tenaient deux onglets, l'annuaire des artisans et les interventions deux autres. Un
    annuaire se lit avec ce qu'on y confie : chaque métier n'a plus qu'un écran, et les deux
    métiers deviennent les deux onglets de `/backoffice/tiers`. Les anciennes URL
    (`/backoffice/notaires*`, `/backoffice/artisans*`, `travaux`, `juridique`) redirigent,
    identifiant conservé pour les liens profonds.
    Chaque onglet porte **un seul filtre**, descendu en prop aux deux sections : un même mot
    cherche le notaire et ses dossiers, l'artisan et ce qu'on lui a confié. Les compteurs
    chiffrés de l'annuaire tombent (la liste se suffit), et ceux des interventions deviennent
    une barre d'avancement empilée par statut, légende chiffrée à côté — la barre est
    décorative, les nombres restent lisibles sans la couleur.

18. **Création en fenêtre, retrait sous condition** — les formulaires de création d'une
    intervention et d'un dossier quittent la page pour une fenêtre : la liste reste en vue,
    la saisie ne la pousse plus vers le bas. Le retrait d'une intervention suit une règle
    portée par le service (`_can_delete_wo`, exposée en `can_delete` sur chaque ligne) :
    *demandé* ou *annulé* n'engage personne, donc libre ; *planifié* ou *en cours* mobilise un
    artisan, donc réservé à `admin` / `agency_admin` (et au super-admin) ; *terminé* porte le
    coût final et reste à l'historique, qu'aucun rôle ne contourne. Le front cache l'action
    plutôt que de laisser cliquer vers un 403, et le `DELETE` refait le test côté service.
    Le changement de statut obéit à la même règle (`_status_change_refusal`), sinon il la
    contournait : replacer un bon terminé en « demandé » rendait n'importe quel rôle maître
    de sa suppression. Et le retrait regarde aussi des faits que le statut courant ne porte
    pas — `completed_at`, `cost_final` — pour qu'un travail déjà clos reste protégé.

## Décisions prises pour éviter les doublons

- **Une seule table de réservations** : `staymanager.staymanager_reservation` sert le miroir
  d'un compte StayManager externe *et* les séjours natifs venus d'iCal. Les colonnes propres
  au miroir deviennent facultatives ; une colonne `source` dit d'où vient la ligne.
- **Pas de second service** : les séjours vivent dans `services/staymanager`, qui portait
  déjà les réservations ; le nom reste, son périmètre s'élargit.
- **Pas de second moteur de PDF, de signature, d'e-mail ni de gabarits** : `contract`,
  `semsar_signing` et `notification` existent et sont utilisés tels quels. Le contrat de
  séjour est un type de document de plus dans `contract`, appelé par `staymanager` en
  interne — pas un second moteur.
- **Pas de second annuaire d'équipes** : les équipes, leurs membres et leurs rôles restent
  dans `identity` ; `staymanager` les lit par `/internal/teams` et ne stocke que le
  rattachement d'un bien à une équipe.
- **Pas de reprise de Firebase, Keycloak ni Twilio** : `identity` fait l'authentification,
  et aucun fournisseur SMS n'est raccordé côté SemsarOut (décision à part).
- **Aucune interface n'est reprise** : les écrans StayManager (React, thème propre) ne sont
  pas portés. Chaque lot reçoit des écrans neufs au thème du back-office SemsarOut, bâtis
  sur `components/kit.jsx` et `components/backoffice/ui.jsx`, dans le même patron que la
  gestion locative (layout à onglets + service JS dédié + clés i18n FR/AR).
- **Les URL iCal sont fournies par l'agence** : elles passent par le même garde-fou que les
  connecteurs ERP/CRM (https, hôte public, pas de redirection suivie).
