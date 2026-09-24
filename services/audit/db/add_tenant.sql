-- Cloisonnement du journal d'activité par produit (semsarout / m3a-l3achrane) : sans cette
-- colonne, le back-office m3a-l3achrane lirait l'activité semsarout. Les lignes existantes
-- sont toutes semsarout, d'où le DEFAULT.
-- Idempotent — applicable sur une base dev/prod existante (psql -f).
ALTER TABLE audit.activity_log
    ADD COLUMN IF NOT EXISTS tenant varchar(30) NOT NULL DEFAULT 'semsar';
CREATE INDEX IF NOT EXISTS ix_activity_log_tenant ON audit.activity_log (tenant);
