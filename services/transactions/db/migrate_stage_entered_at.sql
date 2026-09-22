-- Date d'entrée dans l'étape actuelle (jours sans avancer, page Pipeline). create_all couvre les
-- bases neuves ; ce script ajoute la colonne aux bases existantes. Idempotent : ne remplit que
-- les lignes encore vides.
ALTER TABLE transactions.transaction ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMP;

-- Rétro-remplissage : dernier changement d'étape du journal d'audit, quand il existe...
DO $$
BEGIN
  IF to_regclass('audit.activity_log') IS NOT NULL THEN
    UPDATE transactions.transaction t SET stage_entered_at = a.last_change
    FROM (SELECT entity_id, max(created_at) AS last_change FROM audit.activity_log
          WHERE entity_type = 'transaction' AND action = 'stage_change'
          GROUP BY entity_id) a
    WHERE a.entity_id = t.id AND t.stage_entered_at IS NULL;
  END IF;
END $$;

-- ... sinon la création du dossier.
UPDATE transactions.transaction SET stage_entered_at = COALESCE(created_at, now())
WHERE stage_entered_at IS NULL;
