# Modele Economique - Semsar

Document base sur l'expression de besoin initiale.

## Vision

Portail immobilier marocain **sans dependance a la publicite classique**, avec un modele economique resilient base sur les services a valeur ajoutee.

## References

- **Modele fonctionnel** : SeLoger.com (France)
- **Design** : Touches de couleurs marocaines (rouge, terracotta, or)
- **Integration** : StayManager.ma

## Sources de revenus

### 1. Professionnels (Agences, Promoteurs, Independants)

#### Plans d'abonnement

| Plan | Annonces | Prix/mois | Fonctionnalites |
|------|----------|-----------|-----------------|
| **Starter** | 10 | 299 MAD | Base |
| **Pro** | 50 | 799 MAD | + API, CSV, Analytics |
| **Enterprise** | Illimite | 1999 MAD | + StayManager, Support prioritaire, CRM complet |

#### Frais de mise en relation (Leads)
- Facturation par prospect qualifie (telephone/email)
- Alternative a l'abonnement au volume

#### Interfacage logiciel (Passerelles flux)
- Droit de connexion API
- Synchronisation avec logiciels metiers (Hektor, Ubiflow, etc.)

### 2. Particuliers (Modele Freemium)

#### Publication gratuite
- Attirer du trafic avec annonces gratuites de base

#### Options de visibilite payantes
- **Remontee en tete de liste** : Quotidienne ou hebdomadaire
- **Badge "Urgent"** : Augmente le taux de clic
- **Badge "Coup de coeur"** : Mise en avant visuelle
- **Annonce Premium** : Photos plus grandes, sans concurrents

### 3. Services a Valeur Ajoutee (Marketplace)

#### Pack Visibilite Pro
- Photographe professionnel
- Pilote de drone
- Visite virtuelle 3D (Matterport)

#### Rapports d'estimation
- Prix du marche local
- Historique des ventes du quartier

#### Verification de dossier
- Certification de dossier locataire
- Verification des pieces justificatives

### 4. Partenariats Strategiques

#### Courtage en Credit & Assurance
- Simulateur de pret integre
- Commission par demande de financement

#### Demenagement et Energie
- Devis gratuits pour demenagement
- Changement de contrat d'energie

#### Diagnostics Immobiliers
- Prise de RDV avec diagnostiqueur certifie

## Synthese par type d'offre

| Type d'offre | Modele recommande |
|--------------|-------------------|
| Vente (Pro) | Abonnement mensuel + Options de boost |
| Vente (Particulier) | Publication gratuite + Options payantes |
| Location longue duree | Forfait au succes ou frais de certification |
| Location courte duree | Commission sur le montant (%) |

## Fonctionnalites Backoffice (CRM Agence)

### Module CRM Clients

| Fonctionnalite | Description |
|----------------|-------------|
| **Fiche client** | Profil complet avec historique |
| **Types de clients** | Acheteur, Vendeur, Proprietaire, Locataire, Investisseur |
| **Criteres de recherche** | Budget, localisation, type de bien |
| **Tags et notes** | Organisation personnalisee |
| **Historique interactions** | Appels, emails, SMS, visites |
| **RGPD** | Consentement et preferences marketing |

### Module Leads

| Fonctionnalite | Description |
|----------------|-------------|
| **Sources multiples** | Formulaire, telephone, portails, manuel |
| **Workflow de qualification** | Nouveau → Contacte → Qualifie → Converti |
| **Attribution automatique** | Assignation aux agents |
| **Conversion en client** | Passage automatique au CRM |
| **Statistiques** | Taux de conversion par source |

### Module Visites

| Fonctionnalite | Description |
|----------------|-------------|
| **Calendrier** | Vue mensuelle/hebdomadaire |
| **Types de visite** | Presentiel, video, telephone |
| **Workflow** | Planifie → Confirme → Realise |
| **Compte-rendu** | Rapport de visite et feedback client |
| **Rappels** | Notifications automatiques |

### Module Pipeline (Transactions)

| Fonctionnalite | Description |
|----------------|-------------|
| **Vue Kanban** | Drag & drop entre etapes |
| **Pipeline vente** | Contact → Visite → Offre → Negociation → Compromis → Acte |
| **Pipeline location** | Contact → Visite → Dossier → Verification → Bail → Entree |
| **Suivi des offres** | Offre initiale, contre-offre, acceptation |
| **Commissions** | Calcul et repartition automatique |
| **Probabilite** | Estimation de conclusion |

### Module Equipe

| Fonctionnalite | Description |
|----------------|-------------|
| **Gestion utilisateurs** | Creation, activation, desactivation |
| **Roles predefinies** | Admin, Manager, Agent, Marketing, Comptable |
| **Permissions granulaires** | Par module et par action |
| **Performance** | Statistiques par agent |

### Module Statistiques

| Fonctionnalite | Description |
|----------------|-------------|
| **Dashboard** | KPIs en temps reel |
| **Graphiques** | Leads par source, revenus, conversions |
| **Performance agents** | Classement et objectifs |
| **Export** | CSV, PDF |

## Implementation actuelle

### Realise

#### Site Public
- [x] Systeme d'utilisateurs (particuliers/professionnels)
- [x] Gestion des agences avec API key
- [x] Plans d'abonnement (Starter, Pro, Enterprise)
- [x] Systeme de leads/contacts publics
- [x] Badges Urgent/Premium sur les annonces
- [x] Import CSV (service pret)
- [x] Affichage des prix en MAD
- [x] Carte interactive des biens
- [x] Galerie photos avec lightbox
- [x] Compteur de vues

#### Backoffice Agence
- [x] Tableau de bord avec KPIs
- [x] Gestion des biens immobiliers
- [x] CRM Clients complet
- [x] Gestion des leads avec workflow
- [x] Calendrier des visites
- [x] Pipeline de ventes (Kanban)
- [x] Gestion des transactions
- [x] Gestion des offres
- [x] Gestion de l'equipe
- [x] Roles et permissions
- [x] Page statistiques
- [x] Parametres agence
- [x] Logs d'activite

### A implementer

#### Monetisation
- [ ] Paiement en ligne (CMI ou autre)
- [ ] Options de boost payantes
- [ ] Commission location courte duree

#### Integrations
- [ ] Synchronisation StayManager complete
- [ ] Marketplace de services
- [ ] Simulateur de credit

#### Fonctionnalites avancees
- [ ] Notifications push
- [ ] Application mobile
- [ ] Signature electronique documents
- [ ] Facturation automatisee

## Metriques cles

### Acquisition
- Nombre d'annonces actives
- Nombre d'agences partenaires
- Trafic mensuel

### Conversion
- Taux de conversion lead → contact
- Taux de conversion lead → client
- Taux de conversion visite → offre

### Revenue
- Revenu moyen par agence (ARPA)
- MRR (Monthly Recurring Revenue)
- Churn rate des abonnements

### Engagement
- Temps moyen sur la plateforme
- Taux d'utilisation du backoffice
- NPS (Net Promoter Score)

## Comptes de test

### Backoffice

| Email | Role | Mot de passe |
|-------|------|--------------|
| admin@semsarout.ma | Admin | password123 |
| karim@semsarout.ma | Manager | password123 |
| fatima@semsarout.ma | Agent | password123 |
| ahmed@semsarout.ma | Agent | password123 |
| salma@semsarout.ma | Agent | password123 |
| omar@semsarout.ma | Agent | password123 |
| nadia@semsarout.ma | Marketing | password123 |
| hassan@semsarout.ma | Comptable | password123 |

Acces backoffice : `http://localhost:3000/backoffice`
