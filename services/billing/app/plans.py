"""Dérivation des entitlements de plan (gating) — utilisée par les routes (`/internal/subscription`,
sérialisation `/subscription-plans`) et par le worker (événement `billing.subscription.activated`).
Module séparé de `main.py` pour être importable depuis `worker.py` sans instancier l'app FastAPI."""
from .models import SubscriptionPlan

# Flags de gating "has_*" -> nom de feature exposé dans les claims JWT (`AgencyRO.features`,
# projeté par identity).
FEATURE_FLAGS = (
    ("has_contracts", "contracts"), ("has_legal", "legal"), ("has_artisans", "artisans"),
    ("has_rental", "rental"), ("has_programs", "programs"), ("has_analytics", "analytics"),
    ("has_api_access", "api_access"), ("has_csv_import", "csv_import"),
    ("has_staymanager_sync", "staymanager_sync"), ("has_design3d", "design3d"),
)


def plan_features(p: SubscriptionPlan) -> list[str]:
    return [name for flag, name in FEATURE_FLAGS if getattr(p, flag, False)]
