-- Plans d'abonnement : une seule source, éditable depuis /admin/tarifs.
--
-- Avant : la table était VIDE en production, `app/seed.py` était du code mort ET cassé (il
-- passait une clé `price` qui n'est pas une colonne), et le frontend affichait aux agences une
-- grille en dur que le backend ne connaissait pas. Aucune agence ne pouvait souscrire, et
-- `plan_features()` ne pouvait accorder `design3d` à personne, faute de plan qui le porte.
--
-- `audience` sépare les deux publics qui partagent cette table : sans lui, la page d'une agence
-- afficherait les offres particuliers.
--
-- `create_all` crée la table au démarrage du service AVANT cette migration : les défauts
-- déclarés côté SQLAlchemy n'existent alors pas côté base. Toutes les colonnes sont donc
-- renseignées explicitement (leçon de migrate_pricing.sql, 2026-09-13).
-- Idempotent — applicable sur une base dev/prod existante (psql -f).
ALTER TABLE billing.subscription_plan
    ADD COLUMN IF NOT EXISTS audience varchar(20) NOT NULL DEFAULT 'agency';

-- Tarifs validés le 2026-09-13. L'annuel vaut dix mois : deux mois offerts.
-- Repère commercial : une seule vente au forfait (9 900 Đh) couvre 17 mois de Pro.
INSERT INTO billing.subscription_plan (
    slug, name, description, audience, max_listings, max_featured, max_urgent,
    price_monthly, price_yearly, max_seats, max_teams,
    has_api_access, has_csv_import, has_staymanager_sync, has_lead_contact, has_analytics,
    has_priority_support, has_dedicated_account_manager, has_programs, max_programs,
    has_contracts, has_legal, has_artisans, has_rental, has_design3d, is_active
) VALUES
    ('starter', 'Starter', 'Pour démarrer : publiez vos premières annonces.', 'agency',
     10, 1, 1, 0, 0, 1, 1,
     false, false, false, true, false, false, false, false, 0,
     false, false, false, false, false, true),
    ('pro', 'Pro', 'Pour une agence active : équipe, modules métier et éditeur de plan.', 'agency',
     60, 5, 5, 590, 5900, 5, 2,
     false, false, false, true, true, false, false, true, 5,
     true, true, true, true, true, true),
    ('enterprise', 'Entreprise', 'Sans limite, avec accompagnement dédié.', 'agency',
     -1, -1, -1, 1490, 14900, -1, -1,
     true, true, true, true, true, true, true, true, -1,
     true, true, true, true, true, true),
    -- Particuliers : quotas à ajuster depuis /admin/tarifs si besoin.
    ('free', 'Gratuit', 'Publiez une annonce et testez la plateforme.', 'individual',
     1, 0, 0, 0, 0, 1, 0,
     false, false, false, true, false, false, false, false, 0,
     false, false, false, false, false, true),
    ('basic', 'Essentiel', 'Plus de visibilité pour votre bien.', 'individual',
     3, 1, 0, 99, 990, 1, 0,
     false, false, false, true, false, false, false, false, 0,
     false, false, false, false, false, true),
    ('premium', 'Premium', 'Visibilité maximale et accompagnement.', 'individual',
     5, 2, 1, 199, 1990, 1, 0,
     false, false, false, true, true, true, false, false, 0,
     false, false, false, false, false, true)
ON CONFLICT (slug) DO NOTHING;
