-- Rattrapage : projette la feature `rental` dans identity.agency_ro.features pour les agences
-- dont le plan a has_rental. En régime normal, billing la pousse déjà à l'activation de
-- l'abonnement (événement billing.subscription.activated). Idempotent.
UPDATE identity.agency_ro ar
SET features = (
    SELECT jsonb_agg(DISTINCT f) FROM jsonb_array_elements_text(ar.features::jsonb || '["rental"]'::jsonb) f
)
WHERE ar.id IN (
    SELECT s.agency_id FROM billing.subscription s
    JOIN billing.subscription_plan p ON p.id = s.plan_id
    WHERE p.has_rental
);
