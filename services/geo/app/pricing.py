"""Positionnement prix : où se situe le prix/m² d'un bien dans son quartier.

Porté **à l'identique** du monolithe (`backend/app/api/v1/market.py`) pour la parité.
Base de référence, par priorité :
  1. `NeighborhoodPriceRef` manuelle du quartier (si présente).
  2. Auto : distribution des prix/m² des biens actifs (même ville + quartier +
     transaction), filtrée par type avec repli quartier (tous types), puis ville (par
     type), puis ville.
"""
import math

from sqlalchemy.orm import Session

from .models import ListingRO, NeighborhoodPriceRef

MIN_SAMPLE = 3  # minimum de biens comparables pour une référence auto fiable

SCOPE_LABELS = {
    "manual": "référence quartier",
    "neighborhood_type": "quartier · même type",
    "neighborhood": "quartier",
    "city_type": "ville · même type",
    "city": "ville",
}


def _sqm(row) -> float | None:
    """prix/m² d'un bien (ListingRO), ou None si non calculable."""
    if row.price_per_sqm:
        return float(row.price_per_sqm)
    if row.price and row.surface and row.surface > 0:
        return float(row.price) / float(row.surface)
    return None


def _percentile(sorted_vals, p):
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def _band(percent):
    if percent <= -15:
        return "very_low", "Bien en dessous du marché"
    if percent <= -5:
        return "low", "Sous le marché du quartier"
    if percent < 5:
        return "average", "Dans la moyenne du quartier"
    if percent < 15:
        return "high", "Au-dessus du marché"
    return "very_high", "Bien au-dessus du marché"


def price_position(db: Session, prop: ListingRO) -> dict:
    sqm = _sqm(prop)
    if not sqm:
        return {"available": False, "reason": "no_surface"}

    tx = prop.transaction_type
    ptype = prop.property_type
    city = prop.city
    neighborhood = prop.neighborhood

    reference = low = high = None
    source = "listings"
    scope = None
    sample_size = None

    # 1) Référence manuelle (priorité)
    if city and neighborhood:
        base = db.query(NeighborhoodPriceRef).filter_by(
            city=city, neighborhood=neighborhood, transaction_type=tx
        )
        ref = base.filter_by(property_type=ptype).first() or base.filter_by(property_type=None).first()
        if ref and ref.avg_price_sqm:
            reference = float(ref.avg_price_sqm)
            low = float(ref.min_price_sqm) if ref.min_price_sqm else reference * 0.8
            high = float(ref.max_price_sqm) if ref.max_price_sqm else reference * 1.2
            source = "manual"
            scope = "manual"

    # 2) Auto depuis les biens actifs
    if reference is None:
        attempts = []
        if city and neighborhood:
            attempts.append(("neighborhood_type",
                             [ListingRO.city == city, ListingRO.neighborhood == neighborhood,
                              ListingRO.property_type == ptype]))
            attempts.append(("neighborhood",
                             [ListingRO.city == city, ListingRO.neighborhood == neighborhood]))
        if city:
            attempts.append(("city_type", [ListingRO.city == city, ListingRO.property_type == ptype]))
            attempts.append(("city", [ListingRO.city == city]))

        for label, filters in attempts:
            rows = db.query(ListingRO).filter(
                ListingRO.status == "active",
                ListingRO.transaction_type == tx,
                ListingRO.id != prop.id,
                *filters
            ).all()
            vals = sorted(v for v in (_sqm(r) for r in rows) if v and v > 0)
            if len(vals) >= MIN_SAMPLE:
                reference = _percentile(vals, 50)  # médiane
                low = _percentile(vals, 10)
                high = _percentile(vals, 90)
                scope = label
                sample_size = len(vals)
                break

    if reference is None:
        return {"available": False, "reason": "insufficient_data"}

    # Garde-fou contre des bornes dégénérées
    if high is None or low is None or high <= low:
        low, high = reference * 0.8, reference * 1.2

    percent = round((sqm - reference) / reference * 100, 1)
    position = max(0.0, min(1.0, (sqm - low) / (high - low)))
    band, label = _band(percent)

    return {
        "available": True,
        "transaction_type": tx,
        "property_type": ptype,
        "city": city,
        "neighborhood": neighborhood,
        "property_price_sqm": round(sqm, 2),
        "reference_price_sqm": round(reference, 2),
        "low_price_sqm": round(low, 2),
        "high_price_sqm": round(high, 2),
        "percent_vs_market": percent,
        "position": round(position, 4),
        "band": band,
        "label": label,
        "scope": scope,
        "scope_label": SCOPE_LABELS.get(scope, scope),
        "sample_size": sample_size,
        "source": source,
        "currency": "Dh",
    }
