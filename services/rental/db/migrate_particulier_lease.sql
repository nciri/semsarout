ALTER TABLE rental.lease ADD COLUMN IF NOT EXISTS owner_id INTEGER;
ALTER TABLE rental.lease ADD COLUMN IF NOT EXISTS tenant_user_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_lease_owner ON rental.lease (owner_id);
ALTER TABLE rental.lease ALTER COLUMN mandate_id DROP NOT NULL;
ALTER TABLE rental.lease ALTER COLUMN tenant_client_id DROP NOT NULL;
ALTER TABLE rental.lease ALTER COLUMN agency_id DROP NOT NULL;
