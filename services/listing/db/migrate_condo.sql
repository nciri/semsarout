-- Charges de copropriété (Property listing). create_all couvre les bases neuves ;
-- ce script ajoute les colonnes aux bases existantes (prod).
ALTER TABLE listing.property ADD COLUMN IF NOT EXISTS is_condo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE listing.property ADD COLUMN IF NOT EXISTS condo_fees NUMERIC(10,2);
