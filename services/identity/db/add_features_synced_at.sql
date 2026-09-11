-- I7 : distingue « projection jamais synchronisée » de « synchronisée, et vide » pour
-- `identity.agency_ro.features`. Sans ce marqueur, une agence dont le plan n'accorde
-- légitimement aucune feature (offre gratuite/starter) redéclenchait l'appel HTTP synchrone
-- à billing (`app.auth._features`) à chaque login et chaque /auth/refresh, pour toujours.
-- Idempotent — applicable sur une base dev/prod existante (psql -f).
ALTER TABLE identity.agency_ro
    ADD COLUMN IF NOT EXISTS features_synced_at timestamp NULL;

-- Les agences déjà porteuses de features connues n'ont pas besoin de repasser par billing :
-- marquées synchronisées immédiatement. Celles à `features = '[]'` restent NULL (jamais
-- synchronisées) : le prochain login déclenchera le repli une fois, comme prévu.
UPDATE identity.agency_ro
SET features_synced_at = now()
WHERE features_synced_at IS NULL
  AND features IS NOT NULL
  AND features::jsonb <> '[]'::jsonb;
