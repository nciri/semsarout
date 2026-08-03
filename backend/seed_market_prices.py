"""Seed manual neighborhood reference prices (Dh/m²) for the price gauge.

Indicative values for demonstration — adjust from the back-office.
Run: python3 seed_market_prices.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from seed import app
from app import db
from app.models import NeighborhoodPriceRef

# (city, neighborhood, transaction, avg, min, max) — property_type = None (tous types)
SALE = [
    ('Casablanca', 'Anfa', 22000, 16000, 30000),
    ('Casablanca', 'Maarif', 16000, 12000, 21000),
    ('Casablanca', 'Gauthier', 18000, 13000, 24000),
    ('Casablanca', 'Bourgogne', 15000, 11000, 20000),
    ('Casablanca', 'Racine', 19000, 14000, 25000),
    ('Rabat', 'Agdal', 16000, 12000, 21000),
    ('Rabat', 'Hay Riad', 15000, 11000, 20000),
    ('Rabat', 'Souissi', 17000, 12000, 23000),
    ('Marrakech', 'Guéliz', 14000, 10000, 19000),
    ('Marrakech', 'Amelkis', 13000, 9000, 18000),
    ('Marrakech', 'Hivernage', 16000, 12000, 22000),
    ('Tanger', 'Malabata', 13000, 9000, 18000),
    ('Agadir', 'Founty', 12000, 8500, 16000),
]
RENT = [
    ('Casablanca', 'Anfa', 160, 110, 230),
    ('Casablanca', 'Maarif', 130, 90, 180),
    ('Casablanca', 'Gauthier', 145, 100, 200),
    ('Rabat', 'Agdal', 120, 85, 170),
    ('Rabat', 'Souissi', 130, 90, 190),
    ('Marrakech', 'Guéliz', 110, 75, 160),
    ('Marrakech', 'Amelkis', 100, 70, 150),
    ('Tanger', 'Malabata', 95, 65, 140),
]


def main():
    with app.app_context():
        created = 0
        for tx, rows in (('sale', SALE), ('rent', RENT)):
            for city, nb, avg, lo, hi in rows:
                exists = NeighborhoodPriceRef.query.filter_by(
                    city=city, neighborhood=nb, transaction_type=tx, property_type=None
                ).first()
                if exists:
                    continue
                db.session.add(NeighborhoodPriceRef(
                    city=city, neighborhood=nb, property_type=None, transaction_type=tx,
                    avg_price_sqm=avg, min_price_sqm=lo, max_price_sqm=hi, source='indicatif (démo)'
                ))
                created += 1
        db.session.commit()
        print(f'Created {created} neighborhood price reference(s).')


if __name__ == '__main__':
    main()
