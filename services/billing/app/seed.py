"""Plans par défaut (semés si la table est vide)."""
from .models import SubscriptionPlan

DEFAULT_PLANS = [
    {"slug": "starter", "name": "Starter", "price": 0, "max_seats": 1,
     "has_contracts": False, "has_legal": False, "has_artisans": False, "has_rental": False},
    {"slug": "pro", "name": "Pro", "price": 499, "max_seats": 5,
     "has_contracts": True, "has_legal": True, "has_artisans": True, "has_rental": True},
    {"slug": "enterprise", "name": "Entreprise", "price": 1499, "max_seats": -1,
     "has_contracts": True, "has_legal": True, "has_artisans": True, "has_rental": True},
]


def seed_plans(db) -> None:
    if db.query(SubscriptionPlan).count() == 0:
        db.add_all(SubscriptionPlan(**plan) for plan in DEFAULT_PLANS)
        db.commit()
