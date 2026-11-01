-- Payeur d'une intervention : client et bail concernés, nature, payeur, mode d'imputation,
-- et trace de l'imputation et du règlement. Colonnes nullables : l'historique reste valide.
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS client_id BIGINT;
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS lease_id INTEGER;
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS nature VARCHAR(20);
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS payer VARCHAR(20);
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS charge_mode VARCHAR(24);
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS third_party_label VARCHAR(120);
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS payer_set_by INTEGER;
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS payer_set_at TIMESTAMP;
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS charged_at TIMESTAMP;
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS charged_ref VARCHAR(40);
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP;
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS settled_by INTEGER;
ALTER TABLE directory.work_order ADD COLUMN IF NOT EXISTS settled_method VARCHAR(24);
CREATE INDEX IF NOT EXISTS ix_work_order_client_id ON directory.work_order(client_id);
CREATE INDEX IF NOT EXISTS ix_work_order_lease_id ON directory.work_order(lease_id);
CREATE INDEX IF NOT EXISTS ix_work_order_charged_at ON directory.work_order(charged_at);
