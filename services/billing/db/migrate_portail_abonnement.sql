-- Portail d'abonnement : rétrogradation programmée au terme et journal des mouvements.
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS pending_plan_id INTEGER
  REFERENCES billing.subscription_plan (id);
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS pending_billing_cycle VARCHAR(10);
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS pending_amount NUMERIC(10,2);
ALTER TABLE billing.subscription ADD COLUMN IF NOT EXISTS pending_effective_at TIMESTAMP;

-- Facture de prorata : son règlement ne prolonge pas la période (cf. worker billing).
ALTER TABLE billing.invoice ADD COLUMN IF NOT EXISTS prorated BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS billing.subscription_event (
  id               SERIAL PRIMARY KEY,
  subscription_id  INTEGER NOT NULL REFERENCES billing.subscription (id),
  agency_id        INTEGER NOT NULL,
  kind             VARCHAR(40) NOT NULL,
  detail           JSONB,
  created_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_subscription_event_sub ON billing.subscription_event (subscription_id);
CREATE INDEX IF NOT EXISTS ix_subscription_event_agency ON billing.subscription_event (agency_id);
