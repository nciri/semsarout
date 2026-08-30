-- KYC réel (Didit). create_all couvre les bases neuves ; ce script ajoute les colonnes
-- aux bases existantes (prod/dev déjà initialisées).
ALTER TABLE identity.kyc_verification ALTER COLUMN cin DROP NOT NULL;
ALTER TABLE identity.kyc_verification ADD COLUMN IF NOT EXISTS didit_session_id VARCHAR(64);
ALTER TABLE identity.kyc_verification ADD COLUMN IF NOT EXISTS decision JSON;
CREATE INDEX IF NOT EXISTS ix_kyc_verification_didit_session_id
    ON identity.kyc_verification (didit_session_id);
