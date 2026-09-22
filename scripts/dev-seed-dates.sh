#!/usr/bin/env bash
# Ramène les données de démonstration locales à la date du jour.
#
#   bash scripts/dev-seed-dates.sh            # décale jusqu'à aujourd'hui
#   bash scripts/dev-seed-dates.sh --dry-run  # affiche le décalage sans décaler aucune date
#
# Les données de seed décrivent une journée figée (le 27 juillet 2026 au départ) : leads reçus
# les semaines précédentes, visites planifiées les jours suivants, dossiers à différents stades.
# Le temps passant, tout devenait « en retard de 90 jours » et plus rien n'était « à venir » :
# les écrans étaient exacts mais inutilisables en démonstration.
#
# Le script avance TOUTES les colonnes date/horodatage de la base d'un même nombre de jours,
# ce qui conserve les écarts (âge d'un lead, délai avant une visite, durée d'une étape). Seules
# les valeurs antérieures à « référence + 30 jours » bougent : l'activité réelle postérieure
# (connexions, créations faites à la main en développement) garde ses dates.
#
# La référence courante est mémorisée dans public.dev_seed_clock : rejouer le script plus tard
# ne décale que de l'écart restant. Réservé aux bases de développement (nom en *_dev).
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@localhost:5432/semsar_dev}"
INITIAL_REFERENCE="2026-07-27"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -v initial_ref="$INITIAL_REFERENCE" -v dry_run="$DRY_RUN" <<'SQL'
\set QUIET on
DO $$
BEGIN
  IF current_database() NOT LIKE '%\_dev' THEN
    RAISE EXCEPTION 'Refus : % n''est pas une base de développement (*_dev).', current_database();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.dev_seed_clock (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), reference date NOT NULL);
INSERT INTO public.dev_seed_clock (reference) VALUES (:'initial_ref') ON CONFLICT (id) DO NOTHING;

SELECT reference AS ref, (current_date - reference) AS shift_days FROM public.dev_seed_clock \gset
\echo Référence actuelle : :ref — décalage à appliquer : :shift_days jour(s)

SELECT (:shift_days <= 0 OR :dry_run = 1) AS skip \gset
\if :skip
  \echo Rien à modifier.
\else
BEGIN;
DO $$
DECLARE
  c record;
  n int := 0;
  shift int := (SELECT current_date - reference FROM public.dev_seed_clock);
  cutoff timestamp := (SELECT reference + 30 FROM public.dev_seed_clock);
BEGIN
  FOR c IN
    SELECT col.table_schema AS s, col.table_name AS t, col.column_name AS k
    FROM information_schema.columns col
    JOIN information_schema.tables tab
      ON tab.table_schema = col.table_schema AND tab.table_name = col.table_name AND tab.table_type = 'BASE TABLE'
    WHERE col.data_type IN ('date', 'timestamp without time zone', 'timestamp with time zone')
      AND col.is_generated = 'NEVER'
      AND col.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND NOT (col.table_schema = 'public' AND col.table_name = 'dev_seed_clock')
  LOOP
    EXECUTE format('UPDATE %I.%I SET %I = %I + make_interval(days => %s) WHERE %I < %L',
                   c.s, c.t, c.k, c.k, shift, c.k, cutoff);
    n := n + 1;
  END LOOP;
  UPDATE public.dev_seed_clock SET reference = current_date;
  RAISE NOTICE '% colonnes décalées de % jours.', n, shift;
END $$;
COMMIT;
\endif
SQL
