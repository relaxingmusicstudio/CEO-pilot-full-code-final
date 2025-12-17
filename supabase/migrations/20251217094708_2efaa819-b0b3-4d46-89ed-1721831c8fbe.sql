-- A) DB-LEVEL IDEMPOTENCY: Partial unique index for CEO approval actions
-- Ensures only ONE approve_cold_enrollment can exist per lead in pending/approved status

CREATE UNIQUE INDEX idx_ceo_action_unique_approve_cold_enrollment
ON ceo_action_queue (action_type, target_id)
WHERE action_type = 'approve_cold_enrollment' AND status IN ('pending', 'approved');