"""Pipeline de compatibilité déterministe (PROMPT_INIT §8, aucun LLM).

Trois étages, dans l'ordre :
1. Contraintes dures (filtre binaire, non pondéré) — genre du logement, budget,
   ville, capacité, et tout critère de mode de vie déclaré « décisif » en conflit.
2. Score déterministe 0–100 — pondération budget + mode de vie (préférences).
3. Explications lisibles générées à partir du score (2 à 4 raisons), jamais par LLM.

La similarité vectorielle du dépôt initial (pgvector, ≤15 %) n'est pas portée
(hors périmètre spec §10). `city_id` porte des chaînes de villes (convention mesh).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import StrEnum

__all__ = [
    "Importance",
    "ListingCriteria",
    "MatchResult",
    "SeekerCriteria",
    "Weights",
    "evaluate",
]


class Importance(StrEnum):
    INDIFFERENT = "INDIFFERENT"
    PREFERENCE = "PREFERENCE"
    DECISIF = "DECISIF"


# Correspondance genre du chercheur → genre de logement compatible.
_GENDER_MATCH = {"FEMME": "FEMININ", "HOMME": "MASCULIN"}


@dataclass(frozen=True, slots=True)
class SeekerCriteria:
    gender: str  # FEMME | HOMME
    budget_min: Decimal
    budget_max: Decimal
    city_id: str
    # question_code -> valeur ; question_code -> importance
    lifestyle: dict[str, str] = field(default_factory=dict)
    importance: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ListingCriteria:
    listing_id: str
    housing_gender: str  # FEMININ | MASCULIN | MIXTE_FAMILIAL
    rent: Decimal
    city_id: str
    capacity: int
    # code de règle -> valeur (mêmes codes que le questionnaire de mode de vie)
    house_rules: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Weights:
    version: str
    budget: float = 0.4
    lifestyle: float = 0.6


@dataclass(frozen=True, slots=True)
class MatchResult:
    hard_pass: bool
    hard_failures: list[str]
    score: int
    explanations: list[str]


def _hard_failures(seeker: SeekerCriteria, listing: ListingCriteria) -> list[str]:
    failures: list[str] = []
    if _GENDER_MATCH.get(seeker.gender) != listing.housing_gender:
        failures.append("genre-logement")
    if listing.rent > seeker.budget_max:
        failures.append("budget")
    if listing.city_id != seeker.city_id:
        failures.append("ville")
    if listing.capacity < 1:
        failures.append("capacite")
    # Critères de mode de vie déclarés « décisifs » et en conflit = contrainte dure.
    for code, value in seeker.lifestyle.items():
        if seeker.importance.get(code) == Importance.DECISIF:
            rule = listing.house_rules.get(code)
            if rule is not None and rule != value:
                failures.append(f"decisif:{code}")
    return failures


def _budget_fit(seeker: SeekerCriteria, listing: ListingCriteria) -> float:
    """1.0 si loyer ≤ budget min (très abordable), 0.5 au budget max (dans le budget)."""
    span = seeker.budget_max - seeker.budget_min
    if span <= 0:
        return 1.0
    ratio = float((listing.rent - seeker.budget_min) / span)
    ratio = min(max(ratio, 0.0), 1.0)
    return 1.0 - 0.5 * ratio


def _lifestyle_fit(
    seeker: SeekerCriteria, listing: ListingCriteria
) -> tuple[float, list[str], list[str]]:
    """Fraction de préférences respectées ; retourne (score, atouts, vigilances)."""
    matched: list[str] = []
    mismatched: list[str] = []
    for code, value in seeker.lifestyle.items():
        if seeker.importance.get(code) != Importance.PREFERENCE:
            continue
        rule = listing.house_rules.get(code)
        if rule is None:
            continue
        (matched if rule == value else mismatched).append(code)
    total = len(matched) + len(mismatched)
    fit = 1.0 if total == 0 else len(matched) / total
    return fit, matched, mismatched


def _explanations(
    seeker: SeekerCriteria,
    listing: ListingCriteria,
    matched: list[str],
    mismatched: list[str],
) -> list[str]:
    reasons: list[str] = [
        f"Budget compatible : loyer {listing.rent} ≤ votre maximum {seeker.budget_max}"
    ]
    if matched:
        reasons.append("Modes de vie compatibles : " + ", ".join(matched))
    if mismatched:
        reasons.append("Point de vigilance : " + ", ".join(mismatched))
    return reasons[:4]


def evaluate(seeker: SeekerCriteria, listing: ListingCriteria, weights: Weights) -> MatchResult:
    """Évalue la compatibilité d'un chercheur avec une annonce."""
    failures = _hard_failures(seeker, listing)
    if failures:
        return MatchResult(hard_pass=False, hard_failures=failures, score=0, explanations=[])

    budget_fit = _budget_fit(seeker, listing)
    lifestyle_fit, matched, mismatched = _lifestyle_fit(seeker, listing)

    denom = weights.budget + weights.lifestyle
    raw = (weights.budget * budget_fit + weights.lifestyle * lifestyle_fit) / denom
    score = round(100 * raw)

    return MatchResult(
        hard_pass=True,
        hard_failures=[],
        score=score,
        explanations=_explanations(seeker, listing, matched, mismatched),
    )
