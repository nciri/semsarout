-- Charges de copropriété (Listing coloc). create_all couvre les bases neuves ;
-- ce script ajoute les colonnes aux bases existantes (prod).
ALTER TABLE coloc_listing.listings ADD COLUMN IF NOT EXISTS is_condo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE coloc_listing.listings ADD COLUMN IF NOT EXISTS condo_fees NUMERIC(12,2);
