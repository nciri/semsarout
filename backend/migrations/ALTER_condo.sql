-- Charges de copropriété (Property). create_all couvre les bases neuves ;
-- ce script ajoute les colonnes aux bases existantes (prod).
ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_condo BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS condo_fees NUMERIC(10,2);
