-- Migration des produits : monolithe (public.products) -> catalog.product.
-- À exécuter une fois, AVANT d'activer le reroute BFF (CATALOG_URL).
-- Suppose les deux schémas dans la même base ; sinon, passer par un dump/restore.

INSERT INTO catalog.product
    (id, category, "group", name, description, price, stock, image_url, is_active, created_by, created_at, updated_at)
SELECT id, category, "group", name, description, price, stock, image_url, is_active, created_by, created_at, updated_at
FROM public.products
ON CONFLICT (id) DO NOTHING;

-- Réaligner la séquence d'auto-incrément
SELECT setval(pg_get_serial_sequence('catalog.product', 'id'),
              COALESCE((SELECT MAX(id) FROM catalog.product), 1));
