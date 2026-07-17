# Architecture Technique - Semsar

> Mis à jour le 15 juillet 2026. Pour une vue d'ensemble orientée refonte
> (parcours produits, dette technique, contraintes), voir [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md).

## Vue d'ensemble

Semsar est une plateforme immobilière marocaine construite avec une architecture modulaire séparant clairement le frontend public, le backoffice et le backend API.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│     Backend     │────▶│   PostgreSQL    │
│   React/Vite    │     │   Flask API     │     │                 │
│   Port 3000     │     │   Port 7000     │     │   Port 5432     │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
        │                        │
        │                        ▼
        │               ┌─────────────────┐
        │               │      Redis      │
        │               │  (Cache/Celery) │
        │               │   Port 6379     │
        │               └─────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
├────────────────────┬────────────────────────────────┤
│   Site Public      │         Backoffice             │
│   (Annonces)       │   (CRM, Pipeline, Gestion)     │
└────────────────────┴────────────────────────────────┘
```

## Stack Technique

### Backend

| Technologie | Usage |
|-------------|-------|
| **Python 3.12+** | Langage principal |
| **Flask 3.0** | Framework web |
| **SQLAlchemy 2.0** | ORM |
| **Flask-Migrate** | Migrations DB |
| **Flask-JWT-Extended** | Authentification |
| **PostgreSQL** | Base de données |
| **Redis** | Cache & file de tâches |
| **Celery** | Tâches asynchrones |

### Frontend

| Technologie | Usage |
|-------------|-------|
| **React 18** | Framework UI |
| **Vite 7** | Build tool |
| **Tailwind CSS 3** | Styling |
| **Zustand** | State management |
| **React Query** | Data fetching & cache |
| **React Router 6** | Routing |
| **React Hook Form** | Formulaires |
| **React Icons** | Iconographie |

## Structure du Backend

```
backend/
├── app/
│   ├── __init__.py              # Application factory
│   ├── api/
│   │   ├── __init__.py
│   │   └── v1/                  # API versionnée
│   │       ├── __init__.py      # Blueprint principal
│   │       ├── auth.py          # Authentification (register accepte `interest`)
│   │       ├── properties.py    # Annonces publiques
│   │       ├── selling.py       # Vente en ligne : uploads, estimation, dossiers
│   │       ├── agencies.py      # Agences publiques
│   │       ├── leads.py         # Contacts publics + demandes de service (/contact)
│   │       ├── programs.py      # Programmes neufs (promoteurs)
│   │       ├── subscriptions.py # Abonnements
│   │       ├── payments.py      # Paiements (gateway CMI en TODO, simulé)
│   │       ├── billing.py       # Factures
│   │       ├── users.py         # Profils publics
│   │       ├── integrations/    # Intégration StayManager.ma
│   │       └── backoffice/      # API Backoffice
│   │           ├── __init__.py
│   │           ├── dashboard.py # Tableau de bord
│   │           ├── properties.py# Gestion des biens
│   │           ├── clients.py   # CRM Clients
│   │           ├── leads.py     # Gestion leads
│   │           ├── visits.py    # Visites & RDV
│   │           ├── transactions.py # Pipeline ventes
│   │           ├── roles.py     # Rôles & permissions
│   │           └── stats.py     # Statistiques
│   ├── models/                  # Modèles SQLAlchemy
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── agency.py
│   │   ├── property.py         # Property, PropertyImage, PropertyDocument
│   │   ├── program.py          # Program, ProgramUnit, ProgramImage
│   │   ├── subscription.py     # Plan, Subscription, PaymentMethod, Invoice
│   │   ├── lead.py
│   │   ├── client.py           # CRM Client
│   │   ├── visit.py            # Visites
│   │   ├── transaction.py      # Transactions/Pipeline
│   │   ├── staymanager.py      # Intégration, liens, réservations, sync logs
│   │   └── role.py             # Rôles & permissions
│   ├── services/               # Logique métier
│   │   ├── csv_import.py
│   │   └── staymanager.py
│   └── utils/
├── config/
│   ├── __init__.py
│   └── settings.py             # Configuration par environnement
├── migrations/                 # Migrations Alembic
├── tests/
├── requirements.txt
├── run.py                      # Point d'entrée
├── seed.py                     # Données initiales publiques
└── seed_backoffice.py          # Données de test backoffice
```

## Structure du Frontend

```
frontend/
├── src/
│   ├── main.jsx                # Point d'entrée
│   ├── App.jsx                 # Routes (public + backoffice)
│   ├── components/
│   │   ├── layout/             # Header, Footer, Layout
│   │   ├── common/             # PropertyCard, SearchForm
│   │   ├── properties/
│   │   ├── agencies/
│   │   └── auth/               # PrivateRoute
│   ├── constants/
│   │   ├── services.js         # Référentiel des 6 services (contact/intention)
│   │   └── property.js         # Types de biens, caractéristiques, villes, documents
│   ├── pages/
│   │   ├── Home.jsx
│   │   ├── PropertyList.jsx
│   │   ├── PropertyDetail.jsx
│   │   ├── ProgramList.jsx     # Programmes neufs
│   │   ├── ProgramDetail.jsx
│   │   ├── AgencyList.jsx
│   │   ├── AgencyDetail.jsx
│   │   ├── AgencyPricing.jsx   # Plans agences
│   │   ├── Services.jsx        # Page services à onglets
│   │   ├── Contact.jsx         # Demande de service → lead (?service=)
│   │   ├── SellProperty.jsx    # Wizard vente 100% en ligne (/vendre)
│   │   ├── Checkout.jsx
│   │   ├── auth/
│   │   │   ├── Login.jsx       # honore ?redirect=
│   │   │   └── Register.jsx    # honore ?service= & ?redirect=, question d'intention
│   │   ├── dashboard/          # Espace utilisateur
│   │   │   ├── Dashboard.jsx   # Onboarding personnalisé par user.interest
│   │   │   ├── MyProperties.jsx
│   │   │   ├── CreateProperty.jsx
│   │   │   ├── MyLeads.jsx
│   │   │   ├── MyAgency.jsx
│   │   │   ├── Programs.jsx / ProgramForm.jsx
│   │   │   ├── Subscription.jsx / Settings.jsx
│   │   │   └── integrations/   # StayManager (connexion, biens, réservations)
│   │   └── backoffice/         # Backoffice agence
│   │       ├── components/
│   │       │   └── BackofficeLayout.jsx
│   │       ├── Dashboard.jsx   # Tableau de bord
│   │       ├── Properties.jsx  # Gestion biens
│   │       ├── PropertyForm.jsx
│   │       ├── Clients.jsx     # CRM
│   │       ├── ClientForm.jsx
│   │       ├── Leads.jsx       # Leads
│   │       ├── Visits.jsx      # Calendrier visites
│   │       ├── Pipeline.jsx    # Kanban transactions
│   │       ├── Transactions.jsx
│   │       ├── Team.jsx        # Équipe
│   │       ├── Statistics.jsx  # Analytics
│   │       └── Settings.jsx    # Paramètres
│   ├── store/
│   │   └── authStore.js        # Zustand store
│   ├── services/
│   │   └── api.js              # Configuration API
│   ├── utils/
│   │   └── currency.js         # Formatage prix (MAD)
│   ├── hooks/
│   └── assets/
│       └── styles/
│           └── index.css       # Tailwind + custom
├── public/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Modèles de données

### User
```
- id, email, password_hash
- first_name, last_name, phone
- user_type (particular, professional, admin)
- interest (intention déclarée : vente, mise-en-location, gestion-locative,
  courte-duree, estimation, autre) — pilote l'onboarding du dashboard
- agency_id (FK)
- is_active, is_verified
- created_at, updated_at, last_login
- roles (M2M avec Role)
```

### Agency
```
- id, name, slug, description
- email, phone, website
- address, city, postal_code
- logo_url, cover_image_url
- license_number, rc_number, ice_number
- staymanager_id, api_key
- is_verified, is_active
- created_at, updated_at
```

### Property
```
- id, reference, title, description
- property_type, transaction_type
- price, price_per_sqm, charges
- surface, land_surface
- rooms, bedrooms, bathrooms
- floor, total_floors, construction_year
- features (JSON)
- energy_class, ges_class
- address, city, neighborhood, postal_code
- latitude, longitude
- status (draft, active, pending, sold, rented, archived)
- is_premium, is_urgent, is_featured
- views_count, contacts_count, favorites_count
- owner_id (FK), agency_id (FK)
- created_at, updated_at, published_at
```

### PropertyImage
```
- id, property_id (FK)
- url (public : /uploads/photos/<uuid>), thumbnail_url
- caption, position, is_primary
```

### PropertyDocument (dossier de vente en ligne)
```
- id, property_id (FK)
- doc_type (titre_foncier, cin, plan, reglement_copropriete, diagnostic, autre)
- file_url (nom de fichier stocké opaque — JAMAIS servi publiquement)
- original_name
- Accès : GET /api/v1/documents/<id> uniquement (propriétaire du bien ou admin)
```

### Client (CRM)
```
- id, first_name, last_name
- email, phone, phone_secondary, whatsapp
- address, city, postal_code
- client_type (buyer, seller, landlord, tenant, investor)
- status (active, inactive, archived)
- source (website, phone, referral, portal, social, walk_in)
- search_criteria (JSON)
- budget_min, budget_max
- notes, next_follow_up
- rating (1-5)
- tags (JSON)
- assigned_to_id (FK User)
- agency_id (FK)
- lead_id (FK - si converti depuis lead)
- gdpr_consent, marketing_consent
- created_at, updated_at, last_contact_at
```

### ClientInteraction
```
- id, client_id (FK)
- interaction_type (call, email, sms, whatsapp, visit, meeting, note)
- direction (inbound, outbound)
- subject, content
- duration (secondes)
- property_id (FK - optionnel)
- created_by_id (FK User)
- created_at
```

### Lead
```
- id, name, email, phone, message
- notes
- source (contact_form, phone_reveal, callback_request, website, manual,
  service_request)
- service (pour service_request : vente, mise-en-location, gestion-locative,
  courte-duree, estimation, autre)
- status (new, contacted, qualified, converted, lost)
- lost_reason
- property_id (FK), agency_id (FK), owner_id (FK)
- assigned_to_id (FK User)
- is_charged, charge_amount
- ip_address, user_agent
- created_at, updated_at
- contacted_at, qualified_at, converted_at, lost_at
```

### Visit
```
- id, reference
- property_id (FK), client_id (FK)
- visitor_name, visitor_email, visitor_phone
- scheduled_at, duration_minutes
- visit_type (in_person, video, phone)
- status (scheduled, confirmed, completed, cancelled, no_show)
- agent_id (FK User)
- notes, report, client_feedback
- cancellation_reason
- agency_id (FK)
- created_at, confirmed_at, completed_at
```

### Transaction
```
- id, reference
- property_id (FK), client_id (FK), seller_id (FK)
- agent_id (FK User)
- transaction_type (sale, rent, vacation_rental)
- stage (pipeline stage)
- stage_order
- asking_price, offer_price, final_price
- commission_rate, commission_amount, commission_split (JSON)
- status (active, won, lost, on_hold)
- lost_reason
- contact_date, visit_date, offer_date, acceptance_date
- compromise_date, closing_date, expected_closing_date
- notes, probability, priority
- agency_id (FK)
- created_at, updated_at, closed_at
```

### Offer
```
- id, transaction_id (FK)
- amount, conditions
- offer_type (initial, counter, final)
- from_party (buyer, seller)
- status (pending, accepted, rejected, expired, withdrawn)
- expires_at
- response_notes, responded_at
- created_at, created_by_id (FK User)
```

### Role
```
- id, name, slug, description
- color, level, is_system
- agency_id (FK - null pour rôles système)
- created_at, updated_at
- permissions (M2M avec Permission)
- users (M2M avec User)
```

### Permission
```
- id, name, slug
- description, module
- created_at
```

### ActivityLog
```
- id, user_id (FK)
- action (create, update, delete, login, etc.)
- entity_type, entity_id
- old_values (JSON), new_values (JSON), extra_data (JSON)
- ip_address, user_agent
- agency_id (FK)
- created_at
```

### CalendarEvent
```
- id, title, description
- event_type (visit, meeting, reminder, task, other)
- start_at, end_at, all_day
- location
- user_id (FK), property_id (FK), client_id (FK), visit_id (FK)
- status, reminder_minutes
- agency_id (FK)
- created_at, updated_at
```

### SubscriptionPlan
```
- id, name, slug, description
- max_listings, max_featured, max_urgent
- has_api_access, has_csv_import, has_staymanager_sync
- has_lead_contact, has_analytics, has_priority_support
- price_monthly, price_yearly
- is_active
```

### Subscription
```
- id, agency_id (FK), plan_id (FK)
- billing_cycle, amount, status
- start_date, end_date, trial_end, cancelled_at
- listings_used, featured_used, urgent_used
```

## Pipelines de vente

### Vente immobilière
```
contact → visit → offer → negotiation → compromise → final_act
```

### Location
```
contact → visit → application → verification → lease → move_in
```

## Flux d'authentification

```
1. User POST /auth/login avec email/password
2. Backend vérifie et retourne access_token + refresh_token + user_id
3. Frontend stocke les tokens (localStorage via Zustand persist)
4. Requêtes backoffice incluent:
   - Authorization: Bearer <access_token>
   - X-User-Id: <user_id>
5. Si 401, frontend tente POST /auth/refresh avec refresh_token
6. Si refresh échoue, redirection vers /connexion
```

## Système de rôles et permissions

### Rôles par défaut
| Rôle | Niveau | Description |
|------|--------|-------------|
| Admin | 0 | Accès complet |
| Manager | 10 | Gestion équipe |
| Agent | 50 | Agent immobilier |
| Marketing | 60 | Équipe marketing |
| Comptable | 70 | Accès finances |
| Lecture seule | 100 | Consultation |

### Modules de permissions
- `properties` - Gestion des biens
- `clients` - CRM
- `leads` - Gestion leads
- `visits` - Visites
- `transactions` - Pipeline
- `finances` - Facturation
- `reports` - Rapports
- `settings` - Paramètres
- `users` - Utilisateurs
- `roles` - Rôles

## Vente 100% en ligne (parcours /vendre)

Wizard 5 étapes côté front (`SellProperty.jsx`, état persisté en localStorage) :
descriptif structuré → estimation instantanée → photos → documents → récapitulatif.

Côté backend (`selling.py`) :
- `POST /estimate` (public) : médiane du prix/m² des annonces actives comparables
  (ville+type → ville → type, ≥3 comparables), fourchette ±10%.
- `POST /uploads` (JWT, multipart, `kind=photo|document`).
- `POST /sale-requests` (JWT) : crée l'annonce en statut `pending` + images +
  documents + un lead `service_request/vente` pour l'équipe.

## Fichiers uploadés — modèle de sécurité

- **Photos** : `uploads/photos/`, servies publiquement via
  `GET /uploads/photos/<filename>` (converter `<string>`, pas de traversée de chemin).
- **Documents** (CIN, titres fonciers — PII sensibles) : `uploads/documents/`,
  aucune URL publique. Upload → `file_id` opaque ; téléchargement via
  `GET /api/v1/documents/<id>` avec contrôle propriétaire/admin. Les sérialisations
  exposent `download_url` (endpoint authentifié), jamais le nom de fichier stocké.

## Sécurité

- Mots de passe hashés avec Werkzeug (PBKDF2)
- JWT avec expiration (access: 1h, refresh: 30j)
- CORS configuré pour le frontend
- Validation des entrées
- Rate limiting prévu via Redis
- Logs d'activité pour audit
- Contrôle d'accès par agence (multi-tenant)
- Documents de dossiers de vente derrière auth + ownership (voir section ci-dessus)

## Intégrations

### StayManager.ma
- Partenaire SaaS de gestion courte durée (plans dès 179 Đh/bien/mois, inscription
  en libre-service sur https://staymanager.ma/register)
- Connexion par clé API par compte (`/integrations/staymanager/*`)
- Liaison bien local ↔ bien StayManager, synchronisation, réservations, sync logs, webhook
- Charte graphique partenaire respectée côté front : vert #1F3D34/#2E5E4E,
  beige #F5F0E6, or #C9A24B, wordmark Kaushan Script (composant StayManagerWordmark)

### Import CSV
- Upload de fichier CSV
- Mapping automatique des colonnes
- Validation et rapport d'erreurs

### Paiement (futur)
- Intégration CMI ou autre gateway marocain
- Gestion des abonnements récurrents

## Déploiement

### Développement
```bash
# Backend
cd backend
source venv/bin/activate
flask run --port 7000

# Frontend
cd frontend
npm run dev
```

### Production
- Backend: Gunicorn + Nginx
- Frontend: Build statique (Vite) servi par Nginx
- Base de données: PostgreSQL managé
- Cache: Redis managé
