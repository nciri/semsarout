-- Migration staymanager : monolithe -> staymanager. À exécuter AVANT le reroute BFF.
-- property_ro (bien imbriqué d'un lien) amorcée depuis public.properties. Le reste : 0 ligne.

INSERT INTO staymanager.property_ro (id, agency_id, title, reference)
SELECT id, agency_id, title, reference FROM public.properties ON CONFLICT (id) DO NOTHING;

INSERT INTO staymanager.staymanager_integration (
    id, agency_id, staymanager_user_id, staymanager_email, api_key_encrypted, status, last_sync_at,
    sync_error, auto_sync_enabled, sync_frequency_hours, webhook_secret, webhook_url,
    staymanager_webhook_id, created_at, updated_at)
SELECT
    id, agency_id, staymanager_user_id, staymanager_email, api_key_encrypted, status, last_sync_at,
    sync_error, auto_sync_enabled, sync_frequency_hours, webhook_secret, webhook_url,
    staymanager_webhook_id, created_at, updated_at
FROM public.staymanager_integrations ON CONFLICT (id) DO NOTHING;

INSERT INTO staymanager.staymanager_property_link (
    id, integration_id, property_id, staymanager_property_id, staymanager_property_name,
    sync_reservations, sync_availability, sync_guests, last_reservation_sync, last_availability_sync,
    sync_status, sync_error, ical_url, created_at, updated_at)
SELECT
    id, integration_id, property_id, staymanager_property_id, staymanager_property_name,
    sync_reservations, sync_availability, sync_guests, last_reservation_sync, last_availability_sync,
    sync_status, sync_error, ical_url, created_at, updated_at
FROM public.staymanager_property_links ON CONFLICT (id) DO NOTHING;

-- réservations + logs de sync : 0 ligne actuellement (peuplés par le sync/webhook).
