-- Migration panier/commandes : monolithe -> marketplace. À exécuter AVANT le reroute BFF.
-- product_ro est amorcé depuis public.products (puis maintenu par les événements product.*).

INSERT INTO marketplace.product_ro (id, name, price, stock, image_url, is_active)
SELECT id, name, price, stock, image_url, is_active FROM public.products
ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace.cart (id, user_id, created_at)
SELECT id, user_id, created_at FROM public.carts ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace.cart_item (id, cart_id, product_id, quantity)
SELECT id, cart_id, product_id, quantity FROM public.cart_items ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace."order"
    (id, reference, agency_id, buyer_id, property_id, delivery_address, status,
     subtotal, total, payment_reference, paid_at, created_at, updated_at)
SELECT id, reference, agency_id, buyer_id, property_id, delivery_address, status,
       subtotal, total, payment_reference, paid_at, created_at, updated_at
FROM public.orders ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace.order_item
    (id, order_id, product_id, product_name, unit_price, quantity, line_total)
SELECT id, order_id, product_id, product_name, unit_price, quantity, line_total
FROM public.order_items ON CONFLICT (id) DO NOTHING;

-- Réaligner les séquences
SELECT setval(pg_get_serial_sequence('marketplace.cart', 'id'), COALESCE((SELECT MAX(id) FROM marketplace.cart), 1));
SELECT setval(pg_get_serial_sequence('marketplace.cart_item', 'id'), COALESCE((SELECT MAX(id) FROM marketplace.cart_item), 1));
SELECT setval(pg_get_serial_sequence('marketplace."order"', 'id'), COALESCE((SELECT MAX(id) FROM marketplace."order"), 1));
SELECT setval(pg_get_serial_sequence('marketplace.order_item', 'id'), COALESCE((SELECT MAX(id) FROM marketplace.order_item), 1));
