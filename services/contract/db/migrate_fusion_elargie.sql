-- Fusion élargie : langue du modèle + projections de fusion enrichies.
--
-- `create_all` crée les tables manquantes mais n'émet JAMAIS d'ALTER : sans ce script, les
-- colonnes mappées par l'ORM manquent en production et chaque SELECT du modèle lève
-- `UndefinedColumn` — le service contract tombe en entier.
--
-- Les cinq actes marocains (migrate_modeles_marocains.sql) nomment l'agence par son RC et son
-- ICE, situent le bien par son étage et sa composition, et chiffrent loyer, charges et
-- honoraires. Ces champs existaient déjà chez leurs propriétaires (agency, listing) mais pas
-- dans les projections locales de `contract`, qui n'en portaient que sept.

-- 1. Langue du modèle. Les actes existent en français et en arabe ; la colonne sert à
-- distinguer les deux versions d'un même acte, que seul leur intitulé séparait.
ALTER TABLE contract.contract_template ADD COLUMN IF NOT EXISTS lang VARCHAR(2) DEFAULT 'fr';
UPDATE contract.contract_template SET lang = 'fr' WHERE lang IS NULL;

-- 2. Identité légale de l'agence : ce qu'un mandat doit porter (RC, ICE, siège, contact).
ALTER TABLE contract.agency_ro ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE contract.agency_ro ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE contract.agency_ro ADD COLUMN IF NOT EXISTS email VARCHAR(120);
ALTER TABLE contract.agency_ro ADD COLUMN IF NOT EXISTS rc_number VARCHAR(50);
ALTER TABLE contract.agency_ro ADD COLUMN IF NOT EXISTS ice_number VARCHAR(50);

-- 3. Désignation du bien : ce qu'un acte décrit (étage, composition, charges).
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS title VARCHAR(200);
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100);
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10);
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS floor INTEGER;
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS bedrooms INTEGER;
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS bathrooms INTEGER;
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS land_surface DOUBLE PRECISION;
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS construction_year INTEGER;
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS charges NUMERIC(10,2);
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS condo_fees NUMERIC(10,2);

-- 4. Amorçage. `property_ro` est ensuite maintenue par `listing.*` (app/worker.py) ;
-- `agency_ro` n'a pas d'événement amont (le domaine agence n'en émet pas encore), donc cet
-- amorçage est sa seule source — un changement de RC ou d'ICE devra être rejoué ici.
-- Les tables sources appartiennent à d'autres services : le script tourne en `postgres`
-- (cf. infra/prod/deploy-remote.sh), et les gardes `to_regclass` le rendent inoffensif si
-- un service n'est pas encore déployé.
DO $$
BEGIN
  IF to_regclass('agency.agency') IS NOT NULL THEN
    UPDATE contract.agency_ro r
       SET city = a.city, phone = a.phone, email = a.email,
           rc_number = a.rc_number, ice_number = a.ice_number
      FROM agency.agency a WHERE a.id = r.id;
  ELSIF to_regclass('public.agencies') IS NOT NULL THEN
    UPDATE contract.agency_ro r
       SET city = a.city, phone = a.phone, email = a.email,
           rc_number = a.rc_number, ice_number = a.ice_number
      FROM public.agencies a WHERE a.id = r.id;
  END IF;

  IF to_regclass('listing.property') IS NOT NULL THEN
    UPDATE contract.property_ro r
       SET title = p.title, neighborhood = p.neighborhood, postal_code = p.postal_code,
           floor = p.floor, bedrooms = p.bedrooms, bathrooms = p.bathrooms,
           land_surface = p.land_surface, construction_year = p.construction_year,
           charges = p.charges, condo_fees = p.condo_fees
      FROM listing.property p WHERE p.id = r.id;
  ELSIF to_regclass('public.properties') IS NOT NULL THEN
    UPDATE contract.property_ro r
       SET title = p.title, neighborhood = p.neighborhood, postal_code = p.postal_code,
           floor = p.floor, bedrooms = p.bedrooms, bathrooms = p.bathrooms,
           land_surface = p.land_surface, construction_year = p.construction_year,
           charges = p.charges, condo_fees = p.condo_fees
      FROM public.properties p WHERE p.id = r.id;
  END IF;
END $$;

-- 5. Nature du prix du bien. `price` est un prix de vente sur un bien en vente et un loyer
-- sur un bien en location : sans ces deux colonnes, un bail généré sur un bien en vente
-- écrivait le prix de vente en « loyer mensuel » (cf. `_loyer_mensuel` dans app/merge.py).
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20);
ALTER TABLE contract.property_ro ADD COLUMN IF NOT EXISTS price_period VARCHAR(10);
DO $$
BEGIN
  IF to_regclass('listing.property') IS NOT NULL THEN
    UPDATE contract.property_ro r
       SET transaction_type = p.transaction_type, price_period = p.price_period
      FROM listing.property p WHERE p.id = r.id;
  ELSIF to_regclass('public.properties') IS NOT NULL THEN
    UPDATE contract.property_ro r
       SET transaction_type = p.transaction_type, price_period = p.price_period
      FROM public.properties p WHERE p.id = r.id;
  END IF;
END $$;
