-- A3 : échéance des entitlements projetés dans `identity.agency_ro.features`.
--
-- Une résiliation garde l'accès jusqu'à la fin de la période payée, puis plus rien ne le
-- révoquait : `billing._reconcile_expired` ne tire que depuis `_agency_sub` (aucun balayage
-- périodique ne l'appelle), et identity ne réinterroge jamais billing une fois
-- `features_synced_at` posé (I7). Une agence qui résiliait et ne revenait pas sur ses pages
-- de facturation gardait donc ses droits — le module payant compris — indéfiniment.
--
-- Avec cette borne, la projection expire d'elle-même : `app.auth._features` traite une
-- projection périmée comme non synchronisée, réinterroge billing une fois, ce qui déclenche
-- enfin la réconciliation côté billing et ramène une liste vide.
-- Idempotent — applicable sur une base dev/prod existante (psql -f).
ALTER TABLE identity.agency_ro
    ADD COLUMN IF NOT EXISTS features_until timestamp NULL;

-- Pas de backfill : NULL signifie « pas d'échéance connue », qui est le cas de tout
-- abonnement `active`. Les abonnements déjà résiliés recevront leur borne au prochain
-- `billing.subscription.activated` ou au prochain repli — et, s'ils sont déjà échus, la
-- réconciliation de billing leur rendra une liste vide, ce qui est le résultat voulu.
