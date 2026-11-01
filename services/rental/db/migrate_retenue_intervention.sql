ALTER TABLE rental.deduction_line ADD COLUMN IF NOT EXISTS work_order_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deduction_line_wo
    ON rental.deduction_line(settlement_id, work_order_id) WHERE work_order_id IS NOT NULL;
