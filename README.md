# Semsar - Portail Immobilier Marocain

Plateforme immobilière moderne pour le Maroc, inspirée de SeLoger.com avec des couleurs aux touches marocaines.

## Architecture

```
0semsar/
├── backend/          # API Flask (Python)
├── frontend/         # Application React (Vite + Tailwind)
├── docs/             # Documentation
└── docker-compose.yml
```

## Prérequis

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Docker & Docker Compose (pour Redis)

## Installation

### 1. Base de données PostgreSQL

Créer la base de données :

```bash
psql -U postgres -c "CREATE DATABASE semsar_dev;"
```

### 2. Backend (Flask)

```bash
cd backend

# Créer l'environnement virtuel
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# ou: venv\Scripts\activate  # Windows

# Installer les dépendances
pip install -r requirements.txt

# Configurer l'environnement
cp .env.example .env
# Éditer .env si nécessaire (DATABASE_URL, etc.)

# Initialiser la base de données
export FLASK_APP=run.py
flask db upgrade

# Peupler avec des données de démo
python seed.py
```

### 3. Frontend (React)

```bash
cd frontend

# Installer les dépendances
npm install
```

### 4. Services Docker (Redis)

```bash
# Depuis la racine du projet
docker-compose up -d redis
```

## Démarrage

### Backend (port 7000)

```bash
cd backend
source venv/bin/activate
python run.py
```

L'API sera accessible sur : http://localhost:7000

### Frontend (port 3000)

```bash
cd frontend
npm run dev
```

L'application sera accessible sur : http://localhost:3000

## Compte de démo

- Email : `demo@semsar.ma`
- Mot de passe : `demo1234`

## Endpoints API principaux

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/v1/auth/register` | Inscription |
| POST | `/api/v1/auth/login` | Connexion |
| GET | `/api/v1/properties` | Liste des annonces |
| GET | `/api/v1/properties/:id` | Détail d'une annonce |
| GET | `/api/v1/agencies` | Liste des agences |
| GET | `/api/v1/subscription-plans` | Plans d'abonnement |

Voir [docs/API.md](docs/API.md) pour la documentation complète.

## Structure des dossiers

### Backend

```
backend/
├── app/
│   ├── api/v1/          # Routes API versionnées
│   ├── models/          # Modèles SQLAlchemy
│   ├── services/        # Logique métier
│   └── utils/           # Utilitaires
├── config/              # Configuration
├── migrations/          # Migrations Alembic
└── tests/               # Tests
```

### Frontend

```
frontend/
├── src/
│   ├── components/      # Composants React
│   ├── pages/           # Pages
│   ├── store/           # State management (Zustand)
│   ├── services/        # Services API
│   ├── hooks/           # Custom hooks
│   └── assets/          # Styles, images
└── public/              # Fichiers statiques
```

## Fonctionnalités

- Authentification JWT
- Gestion des annonces (CRUD)
- Recherche avancée avec filtres
- Espace agences avec API key
- Système de leads/contacts
- Plans d'abonnement
- Import CSV
- Intégration StayManager (prévue)

## Licence

Propriétaire - Tous droits réservés
