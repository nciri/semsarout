-- Migration artisans/bons de travaux : monolithe -> directory. À exécuter AVANT le reroute BFF.

INSERT INTO directory.artisan
    (id, agency_id, trade, name, company, city, phone, email, notes, created_by, created_at, updated_at)
SELECT id, agency_id, trade, name, company, city, phone, email, notes, created_by, created_at, updated_at
FROM public.artisans ON CONFLICT (id) DO NOTHING;

INSERT INTO directory.work_order
    (id, agency_id, artisan_id, property_id, title, trade, status, cost_estimate, cost_final,
     scheduled_date, completed_at, notes, created_by, created_at, updated_at)
SELECT id, agency_id, artisan_id, property_id, title, trade, status, cost_estimate, cost_final,
       scheduled_date, completed_at, notes, created_by, created_at, updated_at
FROM public.work_orders ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('directory.artisan', 'id'), COALESCE((SELECT MAX(id) FROM directory.artisan), 1));
SELECT setval(pg_get_serial_sequence('directory.work_order', 'id'), COALESCE((SELECT MAX(id) FROM directory.work_order), 1));
