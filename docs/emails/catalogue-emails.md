# SemsarOut — Catalogue des emails transactionnels & marketing

> Trace de **tous les processus déclencheurs d'emails** d'une agence immobilière, mappés à l'état
> réel de la plateforme SemsarOut. Sert de backlog produit pour le service `notification`.
>
> **Design des emails :** `services/notification/app/templates/` (base commune + gabarits Jinja2,
> autoescape). **Envoi :** service `notification` (SMTP Brevo, cf. `services/notification/.env`).

## Légende de statut

| Statut | Sens |
|---|---|
| ✅ **Fait** | Email réellement envoyé aujourd'hui. |
| 🟡 **Câblable** | Le domaine + les données/événements existent ; il reste à créer le gabarit + brancher l'événement → email (parfois émettre un nouvel événement). |
| 🔴 **À construire** | Nécessite un domaine, un moteur ou un ordonnanceur qui n'existe pas encore. |

## Deux briques transverses manquantes (débloquent beaucoup de 🔴)

1. **Ordonnanceur (scheduler)** — Celery beat / cron. Requis pour tout email **temporel** : rappels
   de visite (J‑1), rapports périodiques (CRG, compte‑rendu de mandat), révision IRL annuelle,
   relances (impayés, pièces manquantes), anniversaires, demandes d'avis différées. Redis/Celery
   étaient dans la cible (`architecture-v2.md`) mais **ne sont pas branchés**.
2. **Domaine « gestion locative »** — baux, quittancement, quittances, charges, dépôts, CRG.
   SemsarOut est aujourd'hui une plateforme **annonces + CRM + transactions + gestion locative (Phase 1)**.
   La suite (quittances, charges, CRG, etc.) se construit par phases. Voir section 3 pour le détail.

---

## 1. Vente & Transactions

### Côté acheteur / prospect
| Processus | Statut | Ce qui existe / manque |
|---|---|---|
| Confirmation de demande de contact | 🟡 | Événement `listing.contacted` émis par `listing` ; le lead (email du prospect) est dans le payload. Manque : gabarit + brancher `notification` sur `listing.contacted`. |
| Alertes rapprochement (matching) | 🔴 | `buyer` a les recherches sauvegardées, mais **pas de moteur de matching** qui, sur `listing.created`, compare aux critères et notifie. À construire (consumer matching). |
| Confirmation de RDV de visite | 🟡 | `crm` gère les visites. Manque : émettre `visit.created` + gabarit + envoi. |
| Rappel automatique du RDV (J‑1) | 🔴 | Nécessite l'**ordonnanceur**. |
| Suivi / avis post‑visite | 🔴 | Ordonnanceur + lien d'avis. |
| Transmission de documents (fiches, plans, DPE) | 🟡 | `listing` gère médias/documents (objets MinIO). Manque : action « envoyer par email » + gabarit avec pièces jointes. |
| Suivi d'offre d'achat (reçue / acceptée / refusée) | 🟡 | `transactions` a un pipeline à étapes (`transaction.updated`). Pas d'entité « offre » distincte ; on peut notifier sur changement d'étape. |

### Côté vendeur / mandant
| Processus | Statut | Ce qui existe / manque |
|---|---|---|
| Compte‑rendu de mandat / d'activité (périodique) | 🔴 | Données présentes (`analytics` : vues, contacts, visites) mais nécessite l'**ordonnanceur** + agrégation en digest. |
| Notification de visite au propriétaire | 🟡 | Visite + propriétaire du bien connus. Manque : gabarit + envoi. |
| Compte‑rendu de visite (retours visiteurs) | 🟡 | Visite a `completed_at` ; le retour visiteur n'est pas encore capturé — à modéliser légèrement. |
| Avis d'échéance de mandat | 🔴 | Pas de « mandat » avec date d'expiration modélisé + ordonnanceur. |

## 2. Location (candidats & bailleurs)

| Processus | Statut | Ce qui existe / manque |
|---|---|---|
| Prise de RDV / visite (candidat) | 🟡 | Idem visites (section 1). |
| Accusé de réception du dossier de candidature | ✅ | Phase 4 : domaine `rental` livré, événement `submit_application` émis et traité. |
| Relance pour pièces manquantes | ✅ | Phase 4 : job ordonnanceur `due-missing-docs-reminders` implémenté. |
| Acceptation / refus du dossier | ✅ | Phase 4 : événement `decide_application` émis et traité. |
| Bailleur : proposition de dossiers candidats | 🔴 | Hors périmètre — optionnel (Phase 4+ planifié). |
| Bailleur : notification de mise en location (bail signé) | ✅ | Phase 1 : domaine `rental` livré, événement `lease.signed` émis et traité. |

> **UI candidat livrée (Phase 6)** : CTA « Postuler » sur l'annonce en location (`PropertyDetail.jsx`),
> suivi « Mes candidatures » (liste + détail), dépôt/téléchargement des pièces justificatives (S3) et
> retrait de candidature — `frontend/src/pages/dashboard/{MyApplications,MyApplicationDetail}.jsx` +
> `applicantService` (`frontend/src/services/rentalService.js`). Charte dashboard respectée (Tailwind
> tokens, `react-icons/fi`, react-query). Les emails ci-dessus (accusé, relance, décision) sont le
> pendant notification de ce parcours candidat.

## 3. Gestion Locative (syndic / administration de biens) — socle livré (Phases 1-4) ; UI livrée (Phases 5-6)

> Service `rental` en place : **Phases 1-4 livrées** (mandats, baux, quittancement, CRG/échéance/dépôt/révision/charges, candidature). **Phase 5 livrée** (UI back-office). **Phase 6 livrée** (UI candidat — postuler, suivi, pièces).

| Processus | Statut | Notes |
|---|---|---|
| Mandat de gestion signé (notification) | ✅ | Phase 1 : événement `mandate.signed` émis et traité. |
| Avis d'échéance de mandat | ✅ | Phase 3 : email envoyé 60j avant expiration du mandat, déclenché par ordonnanceur. |
| Appel de loyer / avis d'échéance (mensuel) | 🔴 | Phase 2/3 (planifié) |
| Quittance de loyer | ✅ | Phase 2 : email + PDF générés et envoyés. |
| Relances impayés (1ʳᵉ amiable, 2ᵉ avant mise en demeure) | ✅ | Phase 2 : dunning (J+3, J+7, max 3) implémenté. |
| Révision annuelle du loyer (indice IRL) | ✅ | Phase 3 : déclenché par l'agence (route back-office `/revise`). |
| Régularisation des charges (décompte annuel) | ✅ | Phase 3 : déclenché par l'agence (route back-office `/charge-regularizations/{id}/send`). |
| Mise à jour pièces (assurance habitation, entretien chaudière) | 🔴 | Phase 2/3 (planifié) |
| Congé / préavis (accusé + consignes) | 🔴 | Phase 2/3 (planifié) |
| États des lieux (entrée/sortie + copie signée) | ✅ | Phase A livré : remplissage + photos + PDF + UI éditeur. Phase B/C : décompte/comparaison/signature. |
| Restitution du dépôt de garantie (décompte final) | ✅ | Phase 3 : email envoyé lors de la restitution, déclenché par événement `DEPOSIT_RETURNED`. |
| Propriétaire : Compte‑rendu de gestion (CRG) mensuel/trimestriel | ✅ | Phase 3 : email + PDF générés et envoyés par ordonnanceur (données loyer + frais). |
| Propriétaire : avis de virement des loyers | ✅ | Phase 2 : avis de paiement généré et envoyé au propriétaire. |
| Propriétaire : demande d'accord pour travaux (devis) | 🔴 | Phase 2/3 (planifié) |
| Propriétaire : aide à la déclaration fiscale (2044 / micro‑foncier) | 🔴 | Phase 2/3 (planifié) |

## 4. Maintenance, Travaux et Sinistres

| Processus | Statut | Ce qui existe / manque |
|---|---|---|
| Déclaration d'incident / sinistre | 🔴 | Pas d'entité « sinistre » (locataire→agence→assureur). |
| Ordre de service (OS) aux prestataires | 🟡 | `directory` a les artisans + bons de travaux. Manque : événement `work_order.created` + gabarit + envoi à l'artisan. |
| Suivi de chantier (RDV d'intervention) | 🔴 | Ordonnanceur + statut d'intervention. |
| Clôture d'intervention (facture acquittée) | 🟡 | Bon de travaux existe ; email de clôture à brancher. |

## 5. Signature Électronique et Contractualisation

> `contract` existe (modèles Contract/Template, WORM, événements `contract.finalized/signed`), **mais
> aucun provider e‑sign réel** (Docusign/Yousign) n'est intégré (cf. ADR‑0005 : e‑signature = stub).

| Processus | Statut | Ce qui existe / manque |
|---|---|---|
| Invitation à signer (mandat, compromis, bail, EDL, avenant) | 🟡 | Événements contrat présents ; manque l'intégration provider + le gabarit avec lien de signature. |
| Rappels automatiques aux signataires retardataires | 🔴 | Ordonnanceur + statut de signature par signataire. |
| Fermeture du dossier (exemplaires signés + certificat de preuve) | 🟡 | `contract.signed` + WORM existent ; brancher l'email avec le PDF/certificat. |

## 6. Marketing, Fidélisation et Transversal

| Processus | Statut | Ce qui existe / manque |
|---|---|---|
| Prospection / nurturing (campagnes) | 🔴 | Pas d'automation marketing / séquences. |
| Anniversaire de transaction / d'emménagement | 🔴 | Ordonnanceur + déclencheur à date. |
| Demande d'avis clients (Google / Immodvisor) | 🔴 | Déclencheur post‑transaction + lien d'avis (ordonnanceur pour le différé). |

---

## Synthèse & ordre de mise en œuvre suggéré

**Déjà en place**
- ✅ Réinitialisation de mot de passe (email auth, hors liste ci‑dessus mais fonctionnel).

**Vague 1 — « câblables » sans nouvelle brique (événements + données déjà là)**
1. Confirmation de contact (prospect) — sur `listing.contacted`.
2. Notification de nouveau lead à l'agence — sur `listing.contacted` / `program.contacted`.
3. Confirmation de visite (émettre `visit.created` dans `crm`) + notification visite au propriétaire.
4. Statut d'offre / transaction — sur `transaction.updated`.
5. Ordre de service artisan + clôture d'intervention — sur `work_order.*` (émettre l'événement).
6. Invitation/fermeture de signature — sur `contract.finalized/signed` (email seul ; provider e‑sign à part).

**Vague 2 — nécessite l'ordonnanceur (Celery/Redis)**
- Rappels de visite (J‑1), avis post‑visite, compte‑rendu de mandat périodique, rappels signature,
  anniversaires, demandes d'avis différées, relances (pièces, impayés).

**Vague 3 — nécessite le domaine « gestion locative » (nouveau service `rental`)**
- Toute la section 3 + section 2 (dossiers/baux) + sinistres (section 4).
- Vague 3 **complète de bout en bout** : backend (Phases 1-4) + emails (accusé/relance/décision,
  quittances, CRG, dépôt) + UI back-office agence (Phase 5) + UI candidat (Phase 6 — postuler, suivre,
  déposer les pièces). Restent hors périmètre : sinistres (section 4) et les processus 🔴 encore listés.

> Chaque email de la vague 1 réutilise la **base de gabarit** (`templates/base.html`) et le **rendu
> autoescapé** (`app/render.py`) — sûr contre l'injection HTML, cohérent avec le design SemsarOut.
