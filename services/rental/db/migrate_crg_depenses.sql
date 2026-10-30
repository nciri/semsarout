ALTER TABLE rental.crg_report ADD COLUMN IF NOT EXISTS expenses NUMERIC(12,2) DEFAULT 0;
ALTER TABLE rental.crg_report ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT 'draft';
ALTER TABLE rental.crg_report ADD COLUMN IF NOT EXISTS expense_lines TEXT;
UPDATE rental.crg_report SET status = 'sent' WHERE sent_at IS NOT NULL;
