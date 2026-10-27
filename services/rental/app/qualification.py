"""Qualification d'une candidature locative : taux d'effort et pièces manquantes.

Deux constats que l'agent lisait jusqu'ici de tête, dans les chiffres bruts du dossier :

- le **taux d'effort** (loyer mensuel / revenu du candidat), seuils usuels du marché marocain ;
- les **pièces obligatoires** encore absentes, un dossier sans elles n'étant pas instruisable.

Le verdict ne porte que sur la solvabilité ; la complétude des pièces reste un champ à part.
Mélanger les deux produirait un « faible » qu'on ne saurait pas lire : revenu insuffisant ou
simple bulletin manquant ? L'agence décide, ces champs ne font que poser les faits.
"""

EFFORT_SOLID = 33.0       # au-delà, le reste à vivre devient tendu
EFFORT_ACCEPTABLE = 40.0  # au-delà, le dossier ne tient que par le garant

GUARANTOR_COVER = 3.0     # revenu du garant couvrant 3 loyers : caution solide

REQUIRED_DOCS = ("cin", "bulletin_salaire", "contrat_travail")
GUARANTOR_DOC = "garant"

MONTHS_PER_YEAR = 12
WEEKS_PER_YEAR = 52
DAYS_PER_MONTH = 30


def monthly_rent(price, price_period: str | None) -> float | None:
    """Loyer ramené au mois : une annonce peut être affichée au jour ou à la semaine."""
    try:
        amount = float(price)
    except (TypeError, ValueError):
        return None
    if amount <= 0:
        return None
    if price_period == "day":
        return amount * DAYS_PER_MONTH
    if price_period == "week":
        return amount * WEEKS_PER_YEAR / MONTHS_PER_YEAR
    return amount


def _amount(value) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out > 0 else None


def _verdict(effort: float | None, guarantor_covers: bool) -> str:
    if effort is None:
        return "unknown"
    if effort <= EFFORT_SOLID:
        return "solid"
    if effort <= EFFORT_ACCEPTABLE:
        return "acceptable"
    # Un garant qui couvre trois loyers rattrape un taux d'effort trop haut, sans le rendre bon.
    return "acceptable" if guarantor_covers else "weak"


def assess(*, rent: float | None, monthly_income, guarantor_income, guarantor_name,
           documents) -> dict:
    """`documents` : itérable de (doc_type, status). Une pièce rejetée ne compte pas."""
    income = _amount(monthly_income)
    guarantor = _amount(guarantor_income)
    effort = round(rent / income * 100, 1) if rent and income else None
    guarantor_covers = bool(rent and guarantor and guarantor >= rent * GUARANTOR_COVER)

    required = list(REQUIRED_DOCS)
    if guarantor_name or guarantor:
        required.append(GUARANTOR_DOC)
    provided = {t for t, status in documents if status != "rejected"}
    missing = [d for d in required if d not in provided]

    return {
        "rent": rent,
        "monthly_income": income,
        "effort_rate": effort,
        "guarantor_income": guarantor,
        "guarantor_covers_rent": guarantor_covers,
        "verdict": _verdict(effort, guarantor_covers),
        "required_documents": required,
        "missing_documents": missing,
        "documents_complete": not missing,
    }
