-- Boutique : agence du panier, pour montrer les paniers non commandés de l'équipe.
-- La colonne est ensuite tenue à jour à chaque passage de l'utilisateur sur son panier.
ALTER TABLE marketplace.cart ADD COLUMN IF NOT EXISTS agency_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_cart_agency_id ON marketplace.cart (agency_id);

-- Rattrapage des paniers existants : agence de la dernière commande de leur propriétaire.
UPDATE marketplace.cart c
SET agency_id = o.agency_id
FROM (
    SELECT DISTINCT ON (buyer_id) buyer_id, agency_id
    FROM marketplace."order"
    WHERE buyer_id IS NOT NULL
    ORDER BY buyer_id, created_at DESC
) o
WHERE c.agency_id IS NULL AND c.user_id = o.buyer_id;
