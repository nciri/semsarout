# SemsarOut — Dossier de System Design

> **But de ce document** : fournir à un lecteur externe (humain ou LLM) tout le contexte
> nécessaire pour comprendre le produit, son architecture actuelle et ses contraintes,
> afin de proposer une refonte du system design. Il est auto-suffisant : aucune lecture
> du code n'est requise pour raisonner sur l'architecture.
>
> Dernière mise à jour : 15 juillet 2026 — branche `feature/staymanager-integration`.

---

## 1. Le produit en bref

**SemsarOut** (nom de code `semsar`) est un portail immobilier marocain inspiré de
SeLoger.com, positionné comme **agence en ligne sans commission** : tarifs fixes et
services à valeur ajoutée plutôt que publicité. Langue de l'interface : français.
Devise : dirham marocain, affiché avec le symbole maison **Đh** (centralisé dans un
utilitaire unique, voir §12).

### Offre commerciale

| Service | Prix | Parcours |
|---|---|---|
| Forfait Vente (agence en ligne) | 4 900 Đh fixe TTC | Parcours de vente 100% en ligne `/vendre` (dossier → validation expert → publication) |
| Photos professionnelles | dès 990 Đh (inclus dans Forfait Vente) | Option du dossier de vente |
| Mise en location | 1 mois de loyer | Demande via page contact (lead) |
| Gestion locative complète | 5% du loyer mensuel | Demande via page contact (lead) |
| Location courte durée | dès 179 Đh/bien/mois | **Externalisé** chez le partenaire StayManager.ma (SaaS en libre-service, plans Manage/Automate/Optimize) |
| Estimation | Gratuite | Estimation automatique par comparables + validation expert |
| Abonnements agences | mensuel/annuel par plan | Espace agences avec clé API, souscription en ligne |
| Programmes neufs | — | Promoteurs publient des programmes avec unités (lots) |

### Acteurs

- **Visiteur** : recherche d'annonces, estimation, contact.
- **Particulier** : vend/loue son bien, suit ses annonces et leads.
- **Professionnel / Agence** : multi-annonces, équipe, clé API, abonnement, import CSV.
- **Équipe interne (backoffice)** : validation des dossiers, CRM (leads, clients,
  visites, pipeline de transactions, offres), statistiques, rôles/permissions.
- **Partenaire StayManager.ma** : plateforme externe de gestion courte durée
  (vérification d'identité voyageurs, serrures connectées, sync iCal) avec
  intégration API bidirectionnelle.

---

## 2. Architecture actuelle (vue d'ensemble)

Monolithe classique : SPA React + API Flask + PostgreSQL, Redis pour Celery.

```
┌──────────────────────┐        ┌──────────────────────┐       ┌──────────────┐
│  Frontend SPA        │  /api  │  Backend Flask        │       │  PostgreSQL  │
│  React 18 + Vite     │──────▶ │  API REST /api/v1     │─────▶ │  semsar_dev  │
│  port 3000 (dev)     │/uploads│  port 7000            │       │  port 5432   │
│  Tailwind, Zustand,  │        │  JWT, SQLAlchemy,     │       └──────────────┘
│  React Query         │        │  Alembic, Celery      │
└──────────────────────┘        └──────┬───────┬────────┘
                                       │       │
                              ┌────────▼──┐  ┌─▼──────────────────┐
                              │  Redis    │  │ Externes :         │
                              │ (Celery,  │  │ - StayManager API  │
                              │  docker)  │  │ - SMTP (Flask-Mail)│
                              └───────────┘  │ - CMI paiement TODO│
                                             └────────────────────┘
```

- Le dev server Vite proxie `/api` et `/uploads` vers le port 7000.
- Pas de conteneurisation de l'app elle-même : seul Redis (+ outils debug
  redis-commander, mailhog) est dans `docker-compose.yml`.
- Pas de CDN, pas de stockage objet : les fichiers uploadés sont sur le disque local
  du backend (`backend/uploads/`).
- Une seule base de données partagée par tous les domaines.

### Trois "applications" dans une seule SPA

| Espace | Préfixe routes | Public | Description |
|---|---|---|---|
| Site public | `/` | oui | Recherche, annonces, programmes, agences, services, contact, vente en ligne |
| Dashboard client | `/dashboard` | JWT | Annonces, leads, agence, abonnement, intégration StayManager |
| Backoffice interne | `/backoffice` | JWT + rôles | CRM complet : leads, clients, visites, pipeline, transactions, stats, équipe, rôles |

---

## 3. Stack technique précise

### Backend (`backend/`)
- Python / **Flask 3.0**, app factory (`app/__init__.py`), un seul blueprint `api_v1_bp`
  monté sur `/api/v1`, avec deux sous-blueprints (`backoffice_bp`, `integrations_bp`).
- **Flask-SQLAlchemy 3.1 / SQLAlchemy 2.0** + **Alembic (Flask-Migrate)** pour les migrations.
- **Flask-JWT-Extended** : access token 1h, refresh token 30 jours, identité = user id (string).
- **Flask-CORS** (origins `*` sur `/api/*`), **Flask-Mail** (SMTP), **Celery + Redis**
  (déclaré mais peu utilisé), **gunicorn** pour la prod, **pytest** pour les tests.
- Config par classes (`config/settings.py`) : `development` / `testing` (sqlite memory) /
  `production`, pilotée par variables d'env (`.env`) : `DATABASE_URL`, `SECRET_KEY`,
  `JWT_SECRET_KEY`, `MAIL_*`, `CELERY_*`, `STAYMANAGER_API_URL`, `STAYMANAGER_API_KEY`.

### Frontend (`frontend/`)
- **React 18** + **Vite 7**, **Tailwind CSS 3** (palette custom `primary` + `terracotta`,
  touches marocaines), **react-router-dom 6**.
- État : **Zustand** (authStore persisté en localStorage) + **React Query 3** pour le
  server state. **react-hook-form** pour les formulaires, **react-toastify**,
  **react-leaflet** (carte des annonces), **swiper**, **jspdf** (factures), **axios**
  (instance unique `services/api.js` avec intercepteurs : injection JWT + refresh
  automatique sur 401).
- Polices : Inter + Poppins (+ Kaushan Script pour le wordmark StayManager).

### Données & infra
- **PostgreSQL 14+** (base `semsar_dev` en dev), **Redis 7** (docker).
- Migrations Alembic linéaires ; tête actuelle : `f3b9d6a2c7e1`.
- Seeds : `seed.py` (données démo : ~22 users, ~56 pages d'annonces, agences, plans)
  et `seed_backoffice.py`.

---

## 4. Modèle de données (30 tables, groupées par domaine)

### Identité & accès
- **users** : email unique, password hash, prénom/nom, téléphone, `user_type`
  (`particular` | `professional` | `admin`), **`interest`** (intention déclarée à
  l'inscription : `vente`, `mise-en-location`, `gestion-locative`, `courte-duree`,
  `estimation`, `autre`), `agency_id` nullable, flags `is_active`/`is_verified`.
- **roles**, **permissions** : RBAC du backoffice (rôle avec `level`, admin = 100,
  relation N-N users↔roles, rôles portent des permissions). Coexiste avec `user_type`
  (héritage historique — source de confusion, voir §14).
- **activity_logs** : journal d'actions backoffice.

### Cœur métier — annonces
- **properties** : référence unique (`SEM-XXXXXXXX`), titre, description, `property_type`
  (apartment/house/villa/riad/land/commercial/office/garage), `transaction_type`
  (sale/rent/vacation_rental), prix + prix/m² + charges, caractéristiques (surface,
  pièces, chambres, SDB, étage, année), `features` (JSON array), classes énergie,
  localisation (ville indexée, quartier, adresse, lat/lng), `status`
  (`draft` → `pending` → `active` → `sold`/`rented`/`archived`), flags de visibilité
  (premium/urgent/featured, boost), compteurs (vues, contacts, favoris),
  `owner_id` (users) et `agency_id` nullable.
- **property_images** : url, thumbnail, position, is_primary.
- **property_documents** *(nouveau, dossier de vente)* : `doc_type`
  (titre_foncier/cin/plan/reglement_copropriete/diagnostic/autre), nom de fichier
  stocké opaque, nom d'origine. **Jamais servi publiquement** (voir §10).

### Programmes neufs (promoteurs)
- **programs** (slug, statut publish/unpublish), **program_units** (lots),
  **program_images**.

### CRM / pipeline (backoffice)
- **leads** : nom/email/téléphone/message, `source`
  (contact_form/phone_reveal/callback_request/website/manual/**service_request**),
  **`service`** (même référentiel que `users.interest`), `status`
  (new/contacted/qualified/converted/lost), rattachement optionnel à une annonce,
  une agence, un propriétaire, un agent assigné, tracking IP/UA, timestamps de cycle de vie.
- **clients** + **client_interactions** : clients qualifiés (conversion possible depuis
  un lead), historique d'interactions.
- **visits** + **calendar_events** : visites planifiées (confirm/complete), agenda.
- **transactions** + **offers** + **transaction_documents** : pipeline kanban de vente
  (stages, déplacement, offres, documents de transaction).

### Monétisation
- **subscription_plans**, **subscriptions** : plans agences, souscription/changement/annulation.
- **payment_methods**, **invoices** : moyens de paiement enregistrés, factures (PDF côté client via jspdf).
- Paiements : modèle avec `gateway_reference` — **l'intégration passerelle (CMI) est un TODO**,
  le paiement carte est simulé. Le checkout front (`/checkout`) est fonctionnel côté UX.

### Intégration StayManager
- **staymanager_integrations** (connexion par compte, clé API), **staymanager_property_links**
  (mapping bien local ↔ bien StayManager), **staymanager_reservations** (réservations
  synchronisées), **staymanager_sync_logs**.

### Agences
- **agencies** : slug public, membres (users), clé API régénérable, leads dédiés,
  page vitrine publique.

---

## 5. Surface API (résumé fonctionnel, ~130 endpoints)

Tous les endpoints sous `/api/v1`. Auth par header `Authorization: Bearer <JWT>`.

### Public (sans auth)
- `POST /auth/register` (accepte `interest`), `POST /auth/login`, `POST /auth/refresh`
- `GET /properties` (filtres + pagination), `POST /properties/search` (recherche avancée),
  `GET /properties/suggestions`, `GET /properties/:id`
- `POST /properties/:id/contact` (lead sur annonce)
- `POST /contact` (lead de demande de service, champ `service`)
- `POST /estimate` (estimation par comparables : médiane du prix/m² des annonces
  actives même ville + même type, élargissement automatique du périmètre, fourchette ±10%)
- `GET /programs`, `GET /programs/:slug` ; `GET /agencies`, `GET /agencies/:slug`,
  `GET /agencies/:slug/properties` ; `GET /subscription-plans`
- `GET /uploads/photos/:filename` (photos d'annonces, servi par Flask)

### Authentifié (client)
- `GET/PUT /auth/me`, `POST /auth/change-password`
- CRUD `/properties` (+ `/publish`), `GET /my-properties`
- `POST /uploads` (multipart, `kind=photo|document`) — photos → URL publique,
  documents → `file_id` opaque privé
- `POST /sale-requests` — **dossier de vente en ligne** : crée l'annonce en `pending`
  + images + documents + lead récapitulatif pour l'équipe
- `GET /documents/:id` — téléchargement d'un document de dossier
  (propriétaire ou admin uniquement)
- `GET /my-leads`, `GET/PUT /leads/:id(/status)`
- CRUD programmes (`/programs`, unités, images, publish/unpublish, `/programs/my`)
- Agence : `GET /my-agency`, `POST/PUT /agencies`, régénération de clé API
- Abonnement/facturation : `/subscribe`, `/my-subscription`, `/subscription/*`,
  `/payment-methods*`, `/invoices*`, `/my-payments`, `/payments/create-intent`,
  `/payments/webhook`
- Intégration StayManager (`/integrations/staymanager/*`) : connect/disconnect/status,
  listing des biens liés/à lier, link/unlink/sync par bien, réservations, calendrier,
  settings, sync-logs, webhook entrant

### Backoffice (JWT + rôles/permissions)
Préfixe `/api/v1/backoffice` : dashboard + graphiques, CRUD leads (assign/qualify/
convert), clients + interactions, propriétés (publish/unpublish, stats, villes),
visites + agenda, transactions (pipeline kanban, stages, move, offres, documents),
statistiques (funnel, performance agents, distribution prix, export), gestion
utilisateurs (activation, rôles), CRUD rôles/permissions.

---

## 6. Parcours utilisateurs clés (implémentés)

### a) Vente 100% en ligne (`/vendre`) — parcours phare
Wizard 5 étapes, saisie **persistée en localStorage** (survit à la création de compte) :
1. **Votre bien** — type, localisation, surface/pièces/étage/année, 16 caractéristiques,
   description libre.
2. **Estimation & prix** — appel `/estimate`, fourchette basse/conseillé/haute affichée
   avec le nombre de comparables ; prix souhaité pré-rempli, alerte si au-dessus de la
   fourchette haute.
3. **Photos** — *porte d'authentification ici si anonyme* (inscription avec
   `?service=vente&redirect=/vendre`, retour au même point) ; upload multiple avec
   aperçus, photo principale, option "shooting professionnel inclus".
4. **Documents** — titre foncier, CIN, plan, règlement de copro, diagnostics
   (facultatifs, stockage privé).
5. **Récapitulatif** — édition par section, certification de propriété, envoi →
   annonce `pending` + lead ; écran de succès avec référence et timeline
   (validation expert 24h → shooting → publication).

### b) Acquisition de leads par service (`/contact`)
Page en 2 étapes : choix du service (6 cartes, pré-sélection via `?service=`) puis
coordonnées (pré-remplies si connecté). Cas particuliers : service *vente* → bandeau
qui pousse vers `/vendre` ; service *courte durée* → panneau StayManager (inscription
en libre-service chez le partenaire). Écran de succès avec CTA de création de compte
propageant le service.

### c) Inscription avec intention
`/inscription?service=X&redirect=Y` : bannière de contexte, question
"Qu'est-ce qui vous amène ?" (stockée dans `users.interest`), redirection
post-inscription vers la cible (chemins internes uniquement). Le dashboard affiche
ensuite un **onboarding personnalisé par intention** tant que l'utilisateur n'a pas
d'annonce.

### d) Courte durée (partenariat StayManager.ma)
Le service n'est pas opéré par SemsarOut : la page Services (onglet "Location Courte
Durée", charte graphique StayManager : vert `#1F3D34`/`#2E5E4E`, beige `#F5F0E6`,
or `#C9A24B`, wordmark Kaushan Script) présente l'offre réelle (vérification
d'identité, serrures connectées, sync iCal, plans dès 179 Đh/bien/mois) et envoie
vers `https://staymanager.ma/register`. Les utilisateurs connectés peuvent lier leur
compte StayManager dans le dashboard (sync des biens et réservations via l'API).

### e) Recherche d'annonces
Recherche avancée (type, transaction, fourchettes de prix, surface, caractéristiques,
villes, classe énergie), suggestions, carte Leaflet, tri, pagination ; placeholder
"Recherche IA" (non implémenté).

---

## 7. Frontend — structure des routes

```
/                       Home (recherche + pitch anti-commission)
/annonces[/:id]         Liste + détail annonces
/programmes[/:slug]     Programmes neufs
/agences[/:slug]        Annuaire + vitrine agence
/agences/tarifs         Plans d'abonnement agences
/nos-services[/:svc]    Page services à onglets (vente, gestion, mise en location,
                        courte durée StayManager, estimation)
/contact                Demande de service → lead (¶6b)
/vendre                 Wizard vente en ligne (¶6a)
/connexion, /inscription  Auth (les deux honorent ?redirect=, inscription ?service=)
/checkout               Paiement forfaits/abonnements (protégé)
/dashboard/*            Espace client : Dashboard (onboarding par intention), annonces,
                        programmes, leads, agence, abonnement, paramètres,
                        integrations/staymanager[/properties|/reservations]
/backoffice/*           CRM interne : dashboard, biens, clients, leads, visites,
                        pipeline, transactions, équipe, statistiques, paramètres, stripe
```

Conventions transverses :
- **Devise** : `src/utils/currency.js` est la source unique (`DIRHAM_SYMBOL = 'Đh'`,
  `formatPrice()` locale fr-MA, format compact K/M). Aucun symbole en dur.
- **Référentiels partagés** : `src/constants/services.js` (les 6 services, labels,
  URL d'inscription StayManager) et `src/constants/property.js` (types de biens,
  caractéristiques, villes, types de documents).
- Composant `StayManagerWordmark` pour la marque partenaire.

---

## 8. Authentification & autorisation

- JWT access (1h) + refresh (30j) ; le front stocke les tokens dans le
  localStorage (`auth-storage`, Zustand persist) — *pas de cookies httpOnly* (voir §14).
- Refresh automatique sur 401 via intercepteur axios.
- Deux mécanismes d'autorisation coexistent :
  1. `user_type` (particular/professional/admin) — vérifié dans certains endpoints.
  2. RBAC rôles/permissions (backoffice) avec niveaux.
- Les agences ont une **clé API** (régénérable) prévue pour l'import de flux externes.
- Contrôles d'accès notables : ownership sur les annonces (CRUD), documents de vente
  servis uniquement au propriétaire ou admin, leads visibles par agence/propriétaire.

---

## 9. Estimation immobilière (algorithme actuel)

`POST /estimate` : médiane du prix/m² des annonces **actives, en vente, avec surface**,
sur trois périmètres essayés dans l'ordre (ville+type → ville → type), premier
périmètre avec ≥ 3 comparables retenu (max 500 lignes scannées). Fourchette = ±10%.
Limites connues : pas de pondération par caractéristiques/quartier/état, la base des
annonces actives est le seul référentiel (pas de données notariales), sensible aux
prix affichés (pas prix de vente réels).

---

## 10. Fichiers uploadés — modèle de sécurité

- `POST /api/v1/uploads` (JWT requis), multipart, champ `kind` :
  - `photo` (jpg/png/webp, 10 Mo) → `uploads/photos/<uuid>.<ext>`, servi publiquement
    par `GET /uploads/photos/<filename>` (converter `<string>` : pas de traversée de
    chemin). Choix assumé : les photos sont destinées à l'annonce publique.
  - `document` (idem + pdf) → `uploads/documents/<uuid>.<ext>`, **aucune URL
    publique**. L'upload retourne un `file_id` opaque ; l'accès passe par
    `GET /api/v1/documents/<id>` avec vérification propriétaire/admin. Les
    sérialisations n'exposent que `download_url` (l'endpoint authentifié), jamais le
    nom de fichier stocké.
- Stockage : **disque local du serveur Flask** — pas de S3/objet, pas d'URLs signées,
  pas de redimensionnement d'images (Pillow présent mais inutilisé pour ça).

---

## 11. Intégration StayManager.ma

- Connexion par clé API par compte utilisateur (`/integrations/staymanager/connect`).
- Mapping bien local ↔ bien StayManager (link/unlink), synchronisation à la demande,
  réservations rapatriées, logs de sync, webhook entrant.
- Config serveur : `STAYMANAGER_API_URL`, `STAYMANAGER_API_KEY`.
- Voir `docs/STAYMANAGER_INTEGRATION_PLAN.md` pour le plan d'origine.

---

## 12. Environnements & exploitation

- **Dev** : `python run.py` (Flask debug, port 7000) + `npm run dev` (Vite, port 3000,
  proxy `/api` et `/uploads`) + Redis docker + PostgreSQL local.
- **Prod (cible actuelle)** : gunicorn ; aucune CI/CD, aucun Dockerfile applicatif,
  pas de reverse proxy décrit, pas de monitoring/APM, logs = stdout Flask.
- Emails : Flask-Mail configuré (SMTP) mais **aucun envoi branché** (ni notification
  de lead, ni vérification d'email). Mailhog dispo en docker pour le dev.
- Celery/Redis déclarés mais **aucune tâche asynchrone réelle**.
- Tests : dossier `backend/tests/` avec pytest ; couverture faible. Pas de tests front.

---

## 13. Comptes & données de démo

- Compte démo : `demo@semsarout.ma` / `demo1234`.
- Seeds : ~22 utilisateurs, ~280 annonces multi-villes, agences, plans d'abonnement.

---

## 14. Dette technique & points de douleur connus (matière pour la refonte)

**Architecture**
1. Monolithe Flask sans séparation service/domaine : logique métier dans les handlers
   de routes (pas de couche service malgré un dossier `app/services/`), sérialisation
   manuelle par `to_dict()` (marshmallow présent mais inutilisé).
2. SPA unique portant 3 applications (public/dashboard/backoffice) : bundle > 500 kB
   minifié (warning Vite), pas de code-splitting, pas de SSR/SEO — **critique pour un
   portail immobilier qui vit du référencement des annonces**.
3. Fichiers sur disque local : non scalable horizontalement, pas de backup défini,
   pas d'images responsives/thumbnails (le champ `thumbnail_url` existe mais n'est
   pas alimenté par l'upload).
4. Pas de cache (Redis présent mais utilisé uniquement comme broker Celery inactif).
5. Recherche = SQL LIKE/filtres ; pas de full-text ni geo-recherche sérieuse
   (lat/lng existent, la carte filtre côté client).

**Sécurité / conformité**
6. JWT en localStorage (XSS-sensible) ; CORS `*` ; pas de rate limiting ; pas de
   vérification d'email ; secrets par défaut en dev dans le code de config.
7. Deux systèmes d'autorisation parallèles (`user_type` vs RBAC) appliqués de façon
   inégale selon les endpoints.
8. Données personnelles sensibles (CIN, titres fonciers) stockées en clair sur disque
   (accès contrôlé par endpoint, mais pas de chiffrement au repos ni d'URLs signées).

**Produit / métier**
9. Paiement en ligne non branché (CMI en TODO, paiements simulés) — le checkout et
   les abonnements agences ne sont pas réellement monétisés.
10. Aucune notification (email/SMS/push) : les leads et dossiers de vente ne
    déclenchent rien vers l'équipe ni vers le client.
11. Pas de vue backoffice dédiée à la **validation des dossiers de vente**
    (l'expert voit une annonce `pending` + un lead, sans écran unifié avec documents).
12. Recherche IA affichée "bientôt disponible" (placeholder non branché).
13. Duplication résiduelle de référentiels côté front (les listes de
    `AdvancedSearch.jsx` dupliquent `constants/property.js`).

**Qualité**
14. Couverture de tests très faible (backend), nulle (frontend) ; pas de CI.
15. Documentation : ce document, `docs/ARCHITECTURE.md` (structure technique
    détaillée) et `docs/API.md` (référence des endpoints) sont à jour au
    15 juillet 2026 ; toute évolution ultérieure doit les maintenir.

---

## 15. Contraintes à respecter dans une refonte

1. **Conserver les parcours produits récents** (ils viennent d'être construits et
   validés) : vente en ligne `/vendre`, contact par service, intention à
   l'inscription, onboarding dashboard, intégration/charte StayManager.
2. **SEO d'abord** : les annonces et programmes doivent devenir indexables
   (SSR/SSG ou pré-rendu) — c'est le principal moteur d'acquisition visé.
3. **Marché marocain** : fr (ar envisagé), dirham `Đh`, villes marocaines, paiement
   local (CMI) prioritaire sur Stripe.
4. **Modèle économique sans publicité** : tout le design doit servir la conversion
   vers les services payants (forfait vente, gestion, abonnements agences).
5. Les données existantes (schéma §4) doivent être migrables.
6. Petite équipe : privilégier une architecture opérable par 1-3 devs (éviter les
   microservices prématurés ; un découpage modulaire du monolithe + extraction du
   backoffice est plus réaliste).

---

## 16. Questions ouvertes pour la refonte

- Faut-il séparer le backoffice en application dédiée (build, auth, déploiement) ?
- SSR (Next.js/Remix) pour le site public seul, en gardant la SPA pour
  dashboard/backoffice ?
- Stockage objet (S3-compatible) + URLs signées + pipeline d'images (thumbnails, WebP) ?
- Moteur de recherche (Postgres full-text + PostGIS vs Meilisearch/Typesense) ?
- File d'attente réelle (notifications email/SMS, syncs StayManager planifiées) ?
- Unification de l'autorisation (RBAC seul, `user_type` déprécié) ?
- Stratégie de paiement : CMI direct, agrégateur local, ou wallet ?
