-- Projette la feature `rental` dans identity.agency_ro.features pour les agences dont le plan a
-- has_rental (billing ne pilote pas encore les features en live). Idempotent.
UPDATE identity.agency_ro ar
SET features = (
    SELECT jsonb_agg(DISTINCT f) FROM jsonb_array_elements_text(ar.features || '["rental"]'::jsonb) f
)
WHERE ar.id IN (
    SELECT s.agency_id FROM public.subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE p.has_rental
);
