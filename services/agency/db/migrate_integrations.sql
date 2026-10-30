-- Connecteurs ERP/CRM d'une agence. create_all couvre les bases neuves ; ce script met à
-- niveau les bases existantes. Les identifiants restent dans ce service, jamais exposés.
CREATE TABLE IF NOT EXISTS agency.integration_connection (
  id             SERIAL PRIMARY KEY,
  agency_id      INTEGER NOT NULL,
  provider       VARCHAR(20) NOT NULL,
  status         VARCHAR(20) DEFAULT 'connected',
  account_label  VARCHAR(150),
  credentials    JSONB DEFAULT '{}'::jsonb,
  last_test_at   TIMESTAMP,
  last_error     VARCHAR(255),
  last_sync_at   TIMESTAMP,
  synced_count   INTEGER DEFAULT 0,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_integration_agency_provider UNIQUE (agency_id, provider)
);
CREATE INDEX IF NOT EXISTS ix_integration_connection_agency
  ON agency.integration_connection (agency_id);
