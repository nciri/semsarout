-- Catalogue tarifaire administrable (spec 2026-09-12-catalogue-tarifaire-design).
--
-- Avant : un montant vivait en quatre endroits (constantes frontend, tunnel de paiement,
-- SERVICE_PRICES du service payment, monolithe legacy), dont un seul faisait autorité sur ce
-- qui était réellement prélevé. Après : `billing.service_price` est la seule source, éditable
-- par le superadmin, et `payment` en tient une projection.
--
-- Le semis est ICI et non dans `app/seed.py` : ce dernier n'est appelé par rien (constaté sur
-- le chantier design3d), alors que cette migration est jouée par deploy-remote.sh.
-- Idempotent — applicable sur une base dev/prod existante (psql -f).
CREATE TABLE IF NOT EXISTS billing.service_price (
    code        varchar(40) PRIMARY KEY,
    amount      numeric(10,2) NOT NULL,
    currency    varchar(3) NOT NULL DEFAULT 'MAD',
    kind        varchar(20) NOT NULL DEFAULT 'one_off',
    is_active   boolean NOT NULL DEFAULT true,
    updated_at  timestamp,
    updated_by  integer
);

CREATE TABLE IF NOT EXISTS billing.price_change (
    id          serial PRIMARY KEY,
    code        varchar(60) NOT NULL,
    old_amount  numeric(10,2),
    new_amount  numeric(10,2) NOT NULL,
    changed_by  integer,
    changed_at  timestamp
);
CREATE INDEX IF NOT EXISTS ix_price_change_code ON billing.price_change (code);
CREATE INDEX IF NOT EXISTS ix_price_change_changed_at ON billing.price_change (changed_at);

-- `create_all` crée cette table au démarrage du service AVANT que cette migration ne soit jouée,
-- et le défaut `MAD` de SQLAlchemy est côté Python : la colonne s'y retrouve NOT NULL sans défaut
-- côté base, et un INSERT qui l'omet échoue. Constaté en production le 2026-09-13.
ALTER TABLE billing.service_price ALTER COLUMN currency SET DEFAULT 'MAD';

-- Semis des tarifs en vigueur. `ON CONFLICT DO NOTHING` : un tarif déjà édité par un
-- administrateur ne doit jamais être réécrit par un redéploiement.
--
-- `photos-pro` (photo seule, 990) est semée INACTIVE : elle quitte l'offre, mais des paiements
-- passés portent ce `service_id` et leur historique doit rester lisible (I7). Les prestations
-- photo payables sont désormais les options elles-mêmes.
INSERT INTO billing.service_price (code, amount, currency, kind, is_active, updated_at) VALUES
    ('forfait-vente',          9900, 'MAD', 'one_off',           true,  now()),
    ('photos-pro-360',          500, 'MAD', 'one_off',           true,  now()),
    ('photos-pro-drone',        800, 'MAD', 'one_off',           true,  now()),
    ('photos-pro-video',       1200, 'MAD', 'one_off',           true,  now()),
    ('photos-pro',              990, 'MAD', 'one_off',           false, now()),
    ('staymanager-manage',      179, 'MAD', 'recurring_monthly', true,  now()),
    ('staymanager-automate',    299, 'MAD', 'recurring_monthly', true,  now()),
    ('staymanager-optimize',    449, 'MAD', 'recurring_monthly', true,  now())
ON CONFLICT (code) DO NOTHING;
