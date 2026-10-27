-- Loyer affiché du bien dans la projection locale de rental : sans lui, aucun taux d'effort
-- ne peut être calculé sur une candidature. create_all couvre les bases neuves ; ce script
-- ajoute les colonnes aux bases existantes et rétro-remplit depuis listing (même instance).
ALTER TABLE rental.property_ro ADD COLUMN IF NOT EXISTS price NUMERIC(12,2);
ALTER TABLE rental.property_ro ADD COLUMN IF NOT EXISTS price_period VARCHAR(10);

UPDATE rental.property_ro ro
SET price = p.price, price_period = p.price_period
FROM listing.property p
WHERE p.id = ro.id AND ro.price IS NULL;
