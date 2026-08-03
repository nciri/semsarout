-- Tenant M3a-L3achrane : comptes séparés par produit sur le même service identity.
-- Idempotent — applicable sur une base dev/prod existante (psql -f).
ALTER TABLE identity.user_ro
    ADD COLUMN IF NOT EXISTS tenant varchar(32) NOT NULL DEFAULT 'semsar';
CREATE INDEX IF NOT EXISTS ix_user_ro_tenant ON identity.user_ro (tenant);

-- L'unicité globale sur email devient (tenant, email). Selon l'historique de la base,
-- l'ancienne unicité est soit un index unique (create_all), soit une contrainte.
DROP INDEX IF EXISTS identity.ix_user_ro_email;
ALTER TABLE identity.user_ro DROP CONSTRAINT IF EXISTS user_ro_email_key;
CREATE INDEX IF NOT EXISTS ix_user_ro_email ON identity.user_ro (email);

DO $$
BEGIN
    ALTER TABLE identity.user_ro
        ADD CONSTRAINT uq_user_ro_tenant_email UNIQUE (tenant, email);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN
    NULL;  -- déjà appliquée
END $$;
