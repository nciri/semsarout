# Documentation API Semsar

> Mis à jour le 15 juillet 2026. Vue d'ensemble produit et architecture :
> [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md).

Base URL : `http://localhost:7000/api/v1`

## Authentification

L'API utilise JWT (JSON Web Tokens). Incluez le token dans le header :

```
Authorization: Bearer <access_token>
```

### Inscription

```http
POST /auth/register
```

**Body :**
```json
{
  "email": "user@example.com",
  "password": "motdepasse123",
  "first_name": "Prénom",
  "last_name": "Nom",
  "phone": "+212 6XX XXX XXX",
  "user_type": "particular",
  "interest": "vente"
}
```

`interest` (optionnel) : intention déclarée, parmi `vente`, `mise-en-location`,
`gestion-locative`, `courte-duree`, `estimation`, `autre`. Stockée sur l'utilisateur,
elle pilote l'onboarding personnalisé du dashboard.

**Réponse :**
```json
{
  "message": "User registered successfully",
  "user": { ... },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

### Connexion

```http
POST /auth/login
```

**Body :**
```json
{
  "email": "user@example.com",
  "password": "motdepasse123"
}
```

**Réponse :**
```json
{
  "user": { ... },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

### Rafraîchir le token

```http
POST /auth/refresh
Authorization: Bearer <refresh_token>
```

### Profil utilisateur

```http
GET /auth/me
Authorization: Bearer <access_token>
```

---

## Annonces Publiques (Properties)

### Liste des annonces

```http
GET /properties
```

**Paramètres de requête :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `page` | int | Page (défaut: 1) |
| `per_page` | int | Résultats par page (défaut: 20, max: 100) |
| `transaction_type` | string | `sale` ou `rent` |
| `property_type` | string | `apartment`, `house`, `villa`, `land`, `commercial`, `office` |
| `city` | string | Filtrer par ville |
| `min_price` | float | Prix minimum |
| `max_price` | float | Prix maximum |
| `min_surface` | float | Surface minimum (m²) |
| `max_surface` | float | Surface maximum (m²) |
| `min_rooms` | int | Nombre de pièces minimum |
| `min_bedrooms` | int | Nombre de chambres minimum |
| `q` | string | Recherche texte (titre, description, ville) |
| `sort` | string | `newest`, `oldest`, `price_asc`, `price_desc` |
| `agency_id` | int | Filtrer par agence |

**Exemple :**
```
GET /properties?transaction_type=sale&city=Casablanca&min_price=1000000&sort=newest
```

**Réponse :**
```json
{
  "properties": [
    {
      "id": 1,
      "reference": "PROP-202601-0001",
      "title": "Appartement 3 pièces vue mer",
      "property_type": "apartment",
      "transaction_type": "sale",
      "price": 1850000,
      "surface": 95,
      "rooms": 3,
      "bedrooms": 2,
      "city": "Casablanca",
      "neighborhood": "Corniche",
      "images": [...],
      ...
    }
  ],
  "total": 150,
  "pages": 8,
  "current_page": 1,
  "per_page": 20,
  "has_next": true,
  "has_prev": false
}
```

### Détail d'une annonce

```http
GET /properties/:id
```

---

## Contacts / Leads Publics

### Contacter un propriétaire

```http
POST /properties/:id/contact
```

**Body :**
```json
{
  "name": "Jean Dupont",
  "email": "jean@example.com",
  "phone": "+212 6XX XXX XXX",
  "message": "Bonjour, je suis intéressé par ce bien..."
}
```

### Demande de service (page contact)

```http
POST /contact
```

Crée un lead `source=service_request` pour l'équipe commerciale. Public, sans auth.

**Body :**
```json
{
  "name": "Jean Dupont",
  "email": "jean@example.com",
  "phone": "+212 6XX XXX XXX",
  "message": "Je souhaite faire gérer mon appartement...",
  "service": "gestion-locative"
}
```

`service` : `vente`, `mise-en-location`, `gestion-locative`, `courte-duree`,
`estimation` ou `autre` (validé côté serveur, 400 sinon).

---

## Estimation

```http
POST /estimate
```

Public. Estime un prix de vente à partir des annonces actives comparables
(médiane du prix/m², périmètre ville+type → ville → type, minimum 3 comparables).

**Body :**
```json
{
  "city": "Casablanca",
  "property_type": "apartment",
  "surface": 85
}
```

**Réponse :**
```json
{
  "available": true,
  "scope": "city_and_type",
  "comparables_count": 12,
  "price_per_sqm": 16556,
  "estimate": 1407291,
  "estimate_low": 1266562,
  "estimate_high": 1548020
}
```

Si moins de 3 comparables : `{"available": false, "message": "..."}`.

---

## Vente en ligne (dossier de vente)

Parcours front `/vendre`. Trois endpoints :

### Upload de fichier

```http
POST /uploads
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

Champs : `file` + `kind` (`photo` ou `document`). Limite 10 Mo.
- `photo` (jpg/jpeg/png/webp) → réponse `{"url": "/uploads/photos/<uuid>.jpg", "original_name": "..."}`.
  L'URL est publique (photos destinées à l'annonce).
- `document` (idem + pdf) → réponse `{"file_id": "<uuid>.pdf", "original_name": "..."}`.
  **Aucune URL publique** : le fichier est privé (CIN, titre foncier...).

### Soumettre un dossier de vente

```http
POST /sale-requests
Authorization: Bearer <access_token>
```

**Body :**
```json
{
  "property": {
    "property_type": "apartment",
    "city": "Casablanca",
    "neighborhood": "Maârif",
    "surface": 85,
    "rooms": 3,
    "bedrooms": 2,
    "bathrooms": 1,
    "construction_year": 2015,
    "features": ["ascenseur", "balcon"],
    "description": "..."
  },
  "desired_price": 1407291,
  "photos": ["/uploads/photos/<uuid>.jpg"],
  "documents": [
    {"doc_type": "titre_foncier", "file_id": "<uuid>.pdf", "original_name": "titre.pdf"}
  ],
  "wants_pro_photos": true
}
```

Règles : `property_type`, `city`, `surface` et `desired_price` requis ; au moins
une photo **ou** `wants_pro_photos=true`. Crée l'annonce en statut `pending`
(titre auto-généré si absent), les images, les documents et un lead
`service_request/vente`. **Réponse 201** : `{"reference": "SEM-XXXXXXXX", "property": {...}}`.

### Télécharger un document de dossier

```http
GET /documents/:id
Authorization: Bearer <access_token>
```

Réservé au propriétaire du bien ou à un admin (403 sinon). Les sérialisations de
documents exposent `download_url` pointant vers cet endpoint, jamais le nom du
fichier stocké.

---

## Agences Publiques

### Liste des agences

```http
GET /agencies
```

**Paramètres :** `page`, `per_page`, `city`, `q`

### Détail d'une agence

```http
GET /agencies/:slug
```

### Annonces d'une agence

```http
GET /agencies/:slug/properties
```

---

## API Backoffice

Base URL : `/api/v1/backoffice`

**Authentification requise :** Toutes les routes du backoffice nécessitent :
```
Authorization: Bearer <access_token>
X-User-Id: <user_id>
```

### Dashboard

#### Statistiques générales

```http
GET /backoffice/dashboard
```

**Réponse :**
```json
{
  "properties": {
    "total": 25,
    "active": 20,
    "draft": 3,
    "sold_this_month": 2
  },
  "leads": {
    "total": 45,
    "new": 12,
    "this_month": 18,
    "this_week": 5,
    "conversion_rate": 15.5
  },
  "clients": {
    "total": 30,
    "active": 25,
    "new_this_month": 8
  },
  "visits": {
    "today": 3,
    "this_week": 12,
    "pending": 8
  },
  "transactions": {
    "active": 10,
    "won_this_month": 3,
    "pipeline_value": 2500000
  },
  "revenue": {
    "this_month": 75000
  },
  "recent_leads": [...],
  "upcoming_visits": [...]
}
```

#### Graphiques

```http
GET /backoffice/dashboard/charts/leads-by-source?days=30
GET /backoffice/dashboard/charts/properties-by-status
GET /backoffice/dashboard/charts/revenue-trend
```

#### Fil d'activité

```http
GET /backoffice/dashboard/activity?page=1&per_page=20
```

---

### Biens Immobiliers (Properties)

#### Liste des biens

```http
GET /backoffice/properties
```

**Paramètres :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `page` | int | Page |
| `per_page` | int | Résultats par page |
| `type` | string | Type de bien |
| `transaction_type` | string | `sale` ou `rent` |
| `status` | string | `active`, `draft`, `pending`, `sold`, `rented`, `archived` |
| `city` | string | Ville |
| `min_price` | float | Prix minimum |
| `max_price` | float | Prix maximum |
| `q` | string | Recherche |
| `sort_by` | string | Colonne de tri |
| `sort_order` | string | `asc` ou `desc` |

#### Détail d'un bien

```http
GET /backoffice/properties/:id
```

#### Créer un bien

```http
POST /backoffice/properties
```

**Body :**
```json
{
  "title": "Appartement moderne - Maarif",
  "description": "Description détaillée...",
  "property_type": "apartment",
  "transaction_type": "sale",
  "price": 1500000,
  "surface": 85,
  "rooms": 3,
  "bedrooms": 2,
  "bathrooms": 1,
  "city": "Casablanca",
  "neighborhood": "Maarif",
  "address": "123 Rue Example",
  "features": ["Parking", "Balcon", "Ascenseur"],
  "status": "draft"
}
```

#### Modifier un bien

```http
PUT /backoffice/properties/:id
```

#### Supprimer (archiver) un bien

```http
DELETE /backoffice/properties/:id
```

#### Publier / Dépublier

```http
POST /backoffice/properties/:id/publish
POST /backoffice/properties/:id/unpublish
```

#### Statistiques des biens

```http
GET /backoffice/properties/stats
```

#### Liste des villes

```http
GET /backoffice/properties/cities
```

---

### Clients (CRM)

#### Liste des clients

```http
GET /backoffice/clients
```

**Paramètres :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `page` | int | Page |
| `per_page` | int | Résultats par page |
| `type` | string | `buyer`, `seller`, `landlord`, `tenant`, `investor` |
| `status` | string | `active`, `inactive`, `archived` |
| `assigned_to` | int | ID de l'agent assigné |
| `source` | string | Source du client |
| `rating` | int | Note (1-5) |
| `q` | string | Recherche |

#### Détail d'un client

```http
GET /backoffice/clients/:id
```

**Réponse :** Inclut les 20 dernières interactions

#### Créer un client

```http
POST /backoffice/clients
```

**Body :**
```json
{
  "first_name": "Mohammed",
  "last_name": "Alaoui",
  "email": "mohammed@email.com",
  "phone": "+212 612345678",
  "client_type": "buyer",
  "source": "website",
  "budget_min": 1000000,
  "budget_max": 2000000,
  "search_criteria": {
    "property_types": ["apartment", "villa"],
    "locations": ["Casablanca"]
  },
  "tags": ["VIP", "Investisseur"],
  "notes": "Client intéressé par le quartier Anfa",
  "gdpr_consent": true
}
```

#### Modifier un client

```http
PUT /backoffice/clients/:id
```

#### Supprimer (archiver) un client

```http
DELETE /backoffice/clients/:id
```

#### Interactions client

```http
GET /backoffice/clients/:id/interactions?page=1&per_page=20
```

```http
POST /backoffice/clients/:id/interactions
```

**Body :**
```json
{
  "interaction_type": "call",
  "direction": "outbound",
  "subject": "Suivi projet achat",
  "content": "Discussion sur les critères de recherche...",
  "duration": 600,
  "property_id": 15
}
```

#### Convertir un lead en client

```http
POST /backoffice/clients/convert-lead/:lead_id
```

**Body (optionnel) :**
```json
{
  "first_name": "Mohammed",
  "last_name": "Alaoui",
  "client_type": "buyer",
  "assigned_to_id": 5
}
```

#### Statistiques clients

```http
GET /backoffice/clients/stats
```

---

### Leads

#### Liste des leads

```http
GET /backoffice/leads
```

**Paramètres :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `page` | int | Page |
| `per_page` | int | Résultats par page |
| `status` | string | `new`, `contacted`, `qualified`, `converted`, `lost` |
| `source` | string | `contact_form`, `phone_reveal`, `callback_request`, `website`, `manual`, `service_request` |
| `assigned_to` | int | ID de l'agent assigné |
| `property_id` | int | ID du bien associé |
| `q` | string | Recherche |

#### Détail d'un lead

```http
GET /backoffice/leads/:id
```

#### Créer un lead

```http
POST /backoffice/leads
```

**Body :**
```json
{
  "name": "Jean Dupont",
  "email": "jean@example.com",
  "phone": "+212 612345678",
  "source": "manual",
  "message": "Client potentiel rencontré au salon",
  "property_id": 10,
  "assigned_to_id": 5
}
```

#### Modifier un lead

```http
PUT /backoffice/leads/:id
```

**Body :**
```json
{
  "status": "qualified",
  "notes": "Client très intéressé"
}
```

#### Supprimer un lead

```http
DELETE /backoffice/leads/:id
```

#### Assigner un lead

```http
POST /backoffice/leads/:id/assign
```

**Body :**
```json
{
  "user_id": 5
}
```

#### Marquer comme contacté

```http
POST /backoffice/leads/:id/contact
```

#### Qualifier un lead

```http
POST /backoffice/leads/:id/qualify
```

#### Statistiques leads

```http
GET /backoffice/leads/stats
```

#### Liste des agents

```http
GET /backoffice/leads/agents
```

---

### Visites

#### Liste des visites

```http
GET /backoffice/visits
```

**Paramètres :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `page` | int | Page |
| `per_page` | int | Résultats par page |
| `status` | string | `scheduled`, `confirmed`, `completed`, `cancelled`, `no_show` |
| `agent_id` | int | ID de l'agent |
| `property_id` | int | ID du bien |
| `client_id` | int | ID du client |
| `date_from` | string | Date de début (ISO) |
| `date_to` | string | Date de fin (ISO) |

#### Calendrier des visites

```http
GET /backoffice/visits/calendar?start=2026-01-01&end=2026-01-31
```

#### Créer une visite

```http
POST /backoffice/visits
```

**Body :**
```json
{
  "property_id": 10,
  "client_id": 25,
  "visitor_name": "Mohammed Alaoui",
  "visitor_email": "mohammed@email.com",
  "visitor_phone": "+212 612345678",
  "scheduled_at": "2026-01-25T10:00:00",
  "duration_minutes": 45,
  "visit_type": "in_person",
  "notes": "Premier rendez-vous"
}
```

#### Confirmer une visite

```http
POST /backoffice/visits/:id/confirm
```

#### Compléter une visite

```http
POST /backoffice/visits/:id/complete
```

**Body :**
```json
{
  "report": "Visite effectuée, client très intéressé",
  "client_feedback": "very_interested"
}
```

#### Annuler une visite

```http
DELETE /backoffice/visits/:id
```

**Body :**
```json
{
  "cancellation_reason": "Report demandé par le client"
}
```

---

### Transactions (Pipeline)

#### Liste des transactions

```http
GET /backoffice/transactions
```

**Paramètres :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `page` | int | Page |
| `per_page` | int | Résultats par page |
| `transaction_type` | string | `sale` ou `rent` |
| `stage` | string | Étape du pipeline |
| `status` | string | `active`, `won`, `lost`, `on_hold` |
| `agent_id` | int | ID de l'agent |
| `priority` | string | `low`, `medium`, `high`, `urgent` |

**Étapes du pipeline vente :** `contact`, `visit`, `offer`, `negotiation`, `compromise`, `final_act`

**Étapes du pipeline location :** `contact`, `visit`, `application`, `verification`, `lease`, `move_in`

#### Vue pipeline (Kanban)

```http
GET /backoffice/transactions/pipeline?transaction_type=sale
```

**Réponse :**
```json
{
  "stages": [
    {
      "id": "contact",
      "name": "Contact initial",
      "order": 0,
      "color": "gray",
      "transactions": [...]
    },
    ...
  ],
  "stats": {
    "total_value": 5000000,
    "total_count": 15,
    "by_status": {...}
  }
}
```

#### Déplacer une transaction (drag & drop)

```http
POST /backoffice/transactions/:id/move
```

**Body :**
```json
{
  "stage": "offer",
  "stage_order": 2
}
```

#### Créer une transaction

```http
POST /backoffice/transactions
```

**Body :**
```json
{
  "property_id": 10,
  "client_id": 25,
  "seller_id": 30,
  "transaction_type": "sale",
  "asking_price": 2000000,
  "commission_rate": 3.0,
  "expected_closing_date": "2026-03-15",
  "priority": "high",
  "notes": "Client motivé"
}
```

#### Modifier une transaction

```http
PUT /backoffice/transactions/:id
```

#### Marquer comme gagnée

```http
POST /backoffice/transactions/:id/won
```

**Body :**
```json
{
  "final_price": 1950000,
  "closing_date": "2026-02-28"
}
```

#### Marquer comme perdue

```http
POST /backoffice/transactions/:id/lost
```

**Body :**
```json
{
  "lost_reason": "Prix trop élevé"
}
```

#### Gérer les offres

```http
GET /backoffice/transactions/:id/offers
POST /backoffice/transactions/:id/offers
PUT /backoffice/offers/:offer_id
```

---

### Utilisateurs / Équipe

#### Liste des utilisateurs

```http
GET /backoffice/users
```

**Paramètres :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `page` | int | Page |
| `per_page` | int | Résultats par page |
| `type` | string | Type d'utilisateur |
| `is_active` | bool | Actif ou non |
| `q` | string | Recherche |

#### Détail d'un utilisateur

```http
GET /backoffice/users/:id
```

#### Modifier les rôles

```http
PUT /backoffice/users/:id/roles
```

**Body :**
```json
{
  "roles": [1, 3]
}
```

#### Activer / Désactiver

```http
POST /backoffice/users/:id/activate
POST /backoffice/users/:id/deactivate
```

---

### Rôles et Permissions

#### Liste des rôles

```http
GET /backoffice/roles
```

#### Créer un rôle

```http
POST /backoffice/roles
```

**Body :**
```json
{
  "name": "Commercial",
  "description": "Agent commercial",
  "color": "blue",
  "level": 60,
  "permissions": [1, 2, 5, 8, 12]
}
```

#### Modifier un rôle

```http
PUT /backoffice/roles/:id
```

#### Supprimer un rôle

```http
DELETE /backoffice/roles/:id
```

#### Liste des permissions

```http
GET /backoffice/permissions
```

**Réponse groupée par module :**
```json
{
  "permissions": [...],
  "grouped": {
    "properties": [
      {"id": 1, "name": "Voir les biens", "slug": "properties.view"},
      {"id": 2, "name": "Créer des biens", "slug": "properties.create"},
      ...
    ],
    "clients": [...],
    ...
  }
}
```

---

### Statistiques

#### Vue d'ensemble

```http
GET /backoffice/stats/overview?period=month
```

#### Performance des agents

```http
GET /backoffice/stats/agent-performance?period=month
```

#### Export des données

```http
GET /backoffice/stats/export?format=csv&type=properties
```

---

## Autres domaines (résumé)

### Espace client (JWT)

| Endpoint | Description |
|---|---|
| `GET/PUT /auth/me`, `POST /auth/change-password` | Profil |
| `GET /my-properties`, CRUD `/properties`, `POST /properties/:id/publish` | Mes annonces |
| `GET /my-leads`, `GET /leads/:id`, `PUT /leads/:id/status` | Mes contacts reçus |
| `GET /my-agency`, `POST/PUT /agencies`, `POST /agencies/:slug/regenerate-api-key` | Mon agence |

### Programmes neufs

| Endpoint | Description |
|---|---|
| `GET /programs`, `GET /programs/:slug` | Public : liste + détail |
| `GET /programs/my`, `POST/PUT/DELETE /programs/:id` | Gestion promoteur |
| `POST /programs/:id/publish`, `/unpublish` | Publication |
| `POST/PUT/DELETE /programs/:id/units[/:unit_id]` | Lots |
| `POST/DELETE /programs/:id/images[/:image_id]`, `/images/reorder` | Images |

### Abonnements & facturation (JWT)

| Endpoint | Description |
|---|---|
| `GET /subscription-plans[/:id]` | Plans (public) |
| `POST /subscribe`, `GET /my-subscription`, `GET /subscription/current` | Souscription |
| `POST /subscription/change-plan`, `POST /cancel-subscription` | Cycle de vie |
| `GET/POST /payment-methods`, `DELETE /payment-methods/:id`, `/set-default` | Moyens de paiement |
| `GET /invoices[/:id[/pdf]]`, `GET /my-payments` | Factures |
| `POST /payments/create-intent`, `GET /payments/:reference`, `POST /payments/webhook` | Paiement (gateway CMI **non branchée**, simulé) |

### Intégration StayManager (`/integrations/staymanager`, JWT)

| Endpoint | Description |
|---|---|
| `POST /connect`, `POST /disconnect`, `GET /status`, `PUT /settings` | Connexion par clé API |
| `GET /properties`, `GET /properties/available` | Biens liés / à lier |
| `POST /properties/:id/link`, `/unlink`, `/sync` | Liaison et synchronisation |
| `GET /reservations[/:id]`, `GET /calendar/:property_id` | Réservations |
| `GET /sync-logs`, `POST /webhook` | Journal et webhook entrant |

---

## Codes d'erreur

| Code | Description |
|------|-------------|
| 400 | Requête invalide |
| 401 | Non authentifié |
| 403 | Non autorisé |
| 404 | Ressource non trouvée |
| 409 | Conflit (ex: email déjà utilisé) |
| 500 | Erreur serveur |

**Format d'erreur :**
```json
{
  "error": "Description de l'erreur"
}
```

---

## Intégration API pour Agences

Les agences avec un plan Pro ou Enterprise ont accès à l'API via leur clé API.

### Authentification par clé API

```
X-API-Key: sk_xxxxxxxxxxxx
```

### Import CSV

Endpoint pour importer des annonces en masse.

### Synchronisation StayManager

Endpoint pour synchroniser avec StayManager.ma.
