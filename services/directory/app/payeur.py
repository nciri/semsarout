"""Règles du payeur d'une intervention : ce que la nature propose, ce que la création exige."""

NATURES: tuple[str, ...] = ("structurel", "entretien", "degat_occupant")
PAYERS: tuple[str, ...] = ("owner", "tenant", "agency", "third_party")
CHARGE_MODES: tuple[str, ...] = ("crg_expense", "deposit_deduction", "to_rebill", "direct", "absorbed")
SETTLE_METHODS: tuple[str, ...] = ("encaisse", "impute_commission", "regularisation", "abandonne")


def payeur_propose(nature: str, a_un_bail: bool) -> str:
    if nature not in NATURES:
        raise ValueError(f"nature inconnue : {nature}")
    if nature == "degat_occupant" or (nature == "entretien" and a_un_bail):
        return "tenant"
    return "owner"


def mode_propose(payer: str, a_un_bail: bool, a_un_mandat: bool) -> str:
    if payer == "owner" and a_un_mandat:
        return "crg_expense"
    if payer == "agency":
        return "absorbed"
    return "to_rebill"


def refus_de_creation(data: dict) -> str | None:
    if data.get("property_id") and not data.get("client_id"):
        return "Le client de l'intervention est requis"
    if any(data.get(k) for k in ("nature", "payer", "charge_mode")):
        if data.get("nature") not in NATURES:
            return "Nature des travaux invalide"
        if data.get("payer") not in PAYERS:
            return "Payeur invalide"
        if data.get("charge_mode") not in CHARGE_MODES:
            return "Mode d'imputation invalide"
        if data["payer"] == "third_party" and not (data.get("third_party_label") or "").strip():
            return "Le nom du tiers payeur est requis"
    return None
