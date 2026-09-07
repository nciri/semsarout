-- Périodicité de prix pour la location (jour/semaine/mois). create_all couvre les bases
-- neuves ; ce script ajoute les colonnes aux bases existantes (prod) et rétro-remplit
-- les annonces de location existantes sur "mois" (comportement historique).
ALTER TABLE listing.property ADD COLUMN IF NOT EXISTS price_period VARCHAR(10);
ALTER TABLE listing.property ADD COLUMN IF NOT EXISTS price_per_day NUMERIC(12,2);

UPDATE listing.property SET price_period = 'month'
WHERE transaction_type = 'rent' AND price_period IS NULL;

UPDATE listing.property SET price_per_day = price
WHERE transaction_type = 'rent' AND price_period = 'day' AND price_per_day IS NULL;

UPDATE listing.property SET price_per_day = price / 7
WHERE transaction_type = 'rent' AND price_period = 'week' AND price_per_day IS NULL;
