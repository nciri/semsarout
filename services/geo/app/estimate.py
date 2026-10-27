"""Estimation d'un bien qui n'existe pas encore, à partir de quelques paramètres.

Même barème que le positionnement d'un bien en ligne (`pricing.market_reference`) : prix/m²
de référence du secteur, puis ajustements tenant aux caractéristiques du bien.

Deux partis pris :
- **Rien d'inventé.** Sans secteur comparable, on renvoie `available: false`. Une estimation
  est un argument commercial opposable : mieux vaut l'absence de chiffre qu'un chiffre faux.
- **Ajustements bornés.** Chaque critère est plafonné, et leur cumul aussi (`MAX_TOTAL`). Une
  saisie erronée (année 1900, 15 étages sans ascenseur) dégrade l'estimation, elle ne la rend
  pas absurde.

Les coefficients sont des ordres de grandeur du marché, pas un modèle appris. Quand la base
portera assez d'annonces, ils céderont la place à une régression — la forme de la réponse ne
changera pas.
"""
from .pricing import _sqm, market_reference

CONDITIONS = {"new": 0.08, "good": 0.0, "refresh": -0.07, "renovate": -0.15}
FEATURES = {"elevator": 0.02, "parking": 0.04, "terrace": 0.05, "pool": 0.07}

FLOOR_FREE = 2            # étages atteints sans peine à pied
FLOOR_MALUS = -0.03       # par étage au-delà, sans ascenseur
FLOOR_MALUS_CAP = -0.10
TOP_FLOOR_BONUS = 0.03    # dernier étage AVEC ascenseur : vue et calme se paient

AGE_FREE = 10             # années sans décote
AGE_MALUS = -0.004        # par année au-delà
AGE_MALUS_CAP = -0.12

MAX_TOTAL = 0.25          # cumul des ajustements, en valeur absolue

# Écart de la fourchette, en part du prix estimé. Plancher et plafond encadrent la dispersion
# réelle du secteur ; le facteur de confiance l'élargit quand la référence est fragile.
SPREAD_MIN, SPREAD_MAX = 0.07, 0.25
CONFIDENCE_FACTOR = {"high": 1.0, "medium": 1.3, "low": 1.6}
SPREAD_HARD_CAP = 0.30

COMPARABLES_SHOWN = 5


def _clamp(value, low, high):
    return max(low, min(high, value))


def _adjustments(*, condition, floor, total_floors, has_elevator, construction_year,
                 features, current_year) -> list[dict]:
    """Écarts retenus, chacun borné. Un critère non renseigné n'apparaît pas."""
    out = []

    if condition in CONDITIONS and CONDITIONS[condition]:
        out.append({"code": f"condition_{condition}", "pct": CONDITIONS[condition]})

    if isinstance(floor, int) and floor > FLOOR_FREE and not has_elevator:
        out.append({"code": "no_elevator_high_floor",
                    "pct": max(FLOOR_MALUS_CAP, (floor - FLOOR_FREE) * FLOOR_MALUS)})
    if (isinstance(floor, int) and isinstance(total_floors, int) and has_elevator
            and floor >= total_floors > 1):
        out.append({"code": "top_floor", "pct": TOP_FLOOR_BONUS})

    if isinstance(construction_year, int) and 1900 <= construction_year <= current_year:
        age = current_year - construction_year
        if age > AGE_FREE:
            out.append({"code": "age", "pct": max(AGE_MALUS_CAP, (age - AGE_FREE) * AGE_MALUS)})

    for code in dict.fromkeys(features or []):      # dédoublonné, ordre conservé
        if code in FEATURES and not (code == "elevator" and not has_elevator):
            out.append({"code": code, "pct": FEATURES[code]})

    return out


def _confidence(scope: str | None, sample_size: int | None, source: str) -> str:
    if source == "manual" or scope in ("manual", "neighborhood_type"):
        if source == "manual" or (sample_size or 0) >= 15:
            return "high"
        return "medium"
    if scope == "neighborhood":
        return "medium" if (sample_size or 0) >= 10 else "low"
    return "low"                                     # portée ville : trop large pour trancher


def _comparables(rows, surface: float) -> list[dict]:
    """Les biens les plus proches en surface : ceux que le vendeur reconnaîtra."""
    scored = [(abs((r.surface or 0) - surface), r) for r in rows if _sqm(r)]
    scored.sort(key=lambda pair: pair[0])
    return [{"id": r.id, "price": float(r.price) if r.price else None,
             "surface": r.surface, "price_sqm": round(_sqm(r), 2),
             "neighborhood": r.neighborhood, "property_type": r.property_type}
            for _, r in scored[:COMPARABLES_SHOWN]]


def estimate(db, *, city, neighborhood, property_type, transaction_type, surface,
             condition=None, floor=None, total_floors=None, has_elevator=False,
             construction_year=None, features=None, current_year) -> dict:
    ref = market_reference(db, city=city, neighborhood=neighborhood,
                           property_type=property_type, transaction_type=transaction_type)
    if ref is None:
        return {"available": False, "reason": "insufficient_data"}

    adjustments = _adjustments(condition=condition, floor=floor, total_floors=total_floors,
                               has_elevator=has_elevator, construction_year=construction_year,
                               features=features, current_year=current_year)
    total = _clamp(sum(a["pct"] for a in adjustments), -MAX_TOTAL, MAX_TOTAL)

    price_sqm = ref["reference"] * (1 + total)
    price = price_sqm * surface

    # Dispersion observée du secteur, élargie selon la confiance de la référence.
    confidence = _confidence(ref["scope"], ref["sample_size"], ref["source"])
    observed = (ref["high"] - ref["low"]) / (2 * ref["reference"])
    spread = min(SPREAD_HARD_CAP,
                 _clamp(observed, SPREAD_MIN, SPREAD_MAX) * CONFIDENCE_FACTOR[confidence])

    return {
        "available": True,
        "transaction_type": transaction_type,
        "property_type": property_type,
        "city": city,
        "neighborhood": neighborhood,
        "surface": surface,
        "estimate": round(price),
        "estimate_low": round(price * (1 - spread)),
        "estimate_high": round(price * (1 + spread)),
        "price_sqm": round(price_sqm, 2),
        "reference_price_sqm": round(ref["reference"], 2),
        "adjustment_pct": round(total * 100, 1),
        "adjustments": [{"code": a["code"], "pct": round(a["pct"] * 100, 1)} for a in adjustments],
        "spread_pct": round(spread * 100, 1),
        "confidence": confidence,
        "scope": ref["scope"],
        "scope_label": ref["scope_label"],
        "sample_size": ref["sample_size"],
        "source": ref["source"],
        "comparables": _comparables(ref["comparables"], surface),
        "currency": "Dh",
    }
