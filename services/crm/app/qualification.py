"""Qualification d'un dossier d'achat : capacité réelle face au budget annoncé.

Un acquéreur annonce un budget ; ce qu'il peut réellement payer, c'est son apport plus ce
qu'une banque lui prêtera. Tant que l'agence ne rapproche pas les deux, elle fait visiter des
biens hors de portée. Ce module pose ce rapprochement, à partir de trois faits que l'agence
demande déjà en rendez-vous : l'apport, la mensualité supportable et l'existence d'un
pré-accord bancaire.

Le taux et la durée sont des ordres de grandeur du marché marocain, pas une offre de prêt :
le chiffre sert à cadrer la recherche, jamais à promettre un financement.
"""

LOAN_RATE = 0.0475        # taux moyen crédit habitat, hors assurance
LOAN_YEARS = 20
MONTHS = 12

TIGHT_RATIO = 0.8         # en deçà de 80 % du budget annoncé, l'écart n'est plus un détail

REQUIRED_DOCS = ("cin", "justificatif_revenu", "releve_bancaire")
PREAPPROVAL_DOC = "accord_bancaire"
DOC_TYPES = (*REQUIRED_DOCS, PREAPPROVAL_DOC, "autre")


def _amount(value) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out > 0 else None


def borrowing_capacity(monthly_payment, *, rate: float = LOAN_RATE,
                       years: int = LOAN_YEARS) -> float | None:
    """Capital qu'une mensualité rembourse sur la durée : annuité classique."""
    payment = _amount(monthly_payment)
    if payment is None:
        return None
    i = rate / MONTHS
    n = years * MONTHS
    return payment * (1 - (1 + i) ** -n) / i


def _verdict(realistic: float | None, budget: float | None) -> str:
    if realistic is None:
        return "unknown"          # ni apport ni mensualité : rien à comparer
    if budget is None:
        return "no_target"        # capacité connue, mais aucun budget annoncé à confronter
    if realistic >= budget:
        return "financed"
    return "tight" if realistic >= budget * TIGHT_RATIO else "gap"


def assess(*, budget_max, down_payment, max_monthly_payment, has_bank_preapproval,
           documents=None) -> dict:
    """`documents` : itérable de (doc_type, status), ou None quand on ne les a pas chargées."""
    apport = _amount(down_payment)
    capacity = borrowing_capacity(max_monthly_payment)
    budget = _amount(budget_max)
    realistic = None if apport is None and capacity is None else (apport or 0.0) + (capacity or 0.0)

    out = {
        "down_payment": apport,
        "max_monthly_payment": _amount(max_monthly_payment),
        "borrowing_capacity": round(capacity) if capacity is not None else None,
        "realistic_budget": round(realistic) if realistic is not None else None,
        "declared_budget": budget,
        "gap": round(realistic - budget) if realistic is not None and budget is not None else None,
        "has_bank_preapproval": bool(has_bank_preapproval),
        "loan_rate_pct": round(LOAN_RATE * 100, 2),
        "loan_years": LOAN_YEARS,
        "verdict": _verdict(realistic, budget),
    }
    if documents is not None:
        required = list(REQUIRED_DOCS)
        if has_bank_preapproval:
            required.append(PREAPPROVAL_DOC)
        provided = {t for t, status in documents if status != "rejected"}
        out["required_documents"] = required
        out["missing_documents"] = [d for d in required if d not in provided]
        out["documents_complete"] = not out["missing_documents"]
    return out
