-- Facture de commission : subscription_id devient nullable, ajout type + compte facturé.
ALTER TABLE billing.invoice ALTER COLUMN subscription_id DROP NOT NULL;
ALTER TABLE billing.invoice ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) NOT NULL DEFAULT 'subscription';
ALTER TABLE billing.invoice ADD COLUMN IF NOT EXISTS account_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_invoice_account ON billing.invoice (account_id);
