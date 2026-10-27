-- Dossier d'achat : capacité de financement sur la fiche client et pièces justificatives.
-- create_all couvre les bases neuves ; ce script met à niveau les bases existantes.
ALTER TABLE crm.client ADD COLUMN IF NOT EXISTS down_payment NUMERIC(12,2);
ALTER TABLE crm.client ADD COLUMN IF NOT EXISTS max_monthly_payment NUMERIC(12,2);
ALTER TABLE crm.client ADD COLUMN IF NOT EXISTS has_bank_preapproval BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS crm.buyer_document (
  id                  BIGSERIAL PRIMARY KEY,
  client_id           BIGINT NOT NULL,
  doc_type            VARCHAR(40),
  status              VARCHAR(20) DEFAULT 'received',
  file_key            VARCHAR(255),
  filename            VARCHAR(255),
  content_type        VARCHAR(100),
  uploaded_by_user_id INTEGER,
  created_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_buyer_document_client ON crm.buyer_document (client_id);
