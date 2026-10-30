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
        if data["payer"] == "third_party" and not _libelle(data.get("third_party_label")):
            return "Le nom du tiers payeur est requis"
    return None


def _libelle(valeur: object) -> str:
    return valeur.strip() if isinstance(valeur, str) else ""


# Dès qu'une dépense figure sur un relevé parti ou réglé, ces champs la définissent : les
# réécrire rendrait faux un document déjà signé.
_CHAMPS_DEPENSE = ("cost_final", "cost_estimate", "payer", "charge_mode", "nature",
                   "client_id", "lease_id", "third_party_label")


# Ce qui décide qui paie : seule l'administration y touche une fois l'intervention achevée.
# Distinct de `_CHAMPS_DEPENSE` : les coûts n'y figurent pas, `_wo_is_sealed` les gouverne déjà.
_CHAMPS_PAYEUR = ("payer", "charge_mode", "nature", "client_id", "lease_id", "third_party_label")


def tiers_sans_nom(wo, data: dict) -> str | None:
    """Même règle qu'à la création : un tiers payeur sans nom n'est pas un destinataire."""
    if "payer" not in data and "third_party_label" not in data:
        return None
    if data.get("payer", wo.payer) == "third_party" and not _libelle(
            data.get("third_party_label", wo.third_party_label)):
        return "Le nom du tiers payeur est requis"
    return None


def valeur_inconnue(data: dict) -> str | None:
    for cle, permis, message in (("nature", NATURES, "Nature des travaux invalide"),
                                 ("payer", PAYERS, "Payeur invalide"),
                                 ("charge_mode", CHARGE_MODES, "Mode d'imputation invalide")):
        if data.get(cle) is not None and data[cle] not in permis:
            return message
    return None


def refus_de_modification(principal, wo, data: dict) -> str | None:
    # Import tardif : `main` importe ce module, et le rôle d'administration y est défini.
    from .main import _is_wo_admin

    inconnue = valeur_inconnue(data)
    if inconnue:
        return inconnue
    if (wo.charged_at is not None or wo.settled_at is not None) and any(k in data for k in _CHAMPS_DEPENSE):
        return "Cette dépense figure sur un relevé déjà émis : elle ne se modifie plus"
    # Statut d'arrivée, sinon `{"status": "done", "payer": ...}` contournerait la garde ;
    # `or` car un statut nul ne change rien.
    if (data.get("status") or wo.status) == "done" and any(k in data for k in _CHAMPS_PAYEUR) \
            and not _is_wo_admin(principal):
        return "Le payeur d'une intervention achevée ne se modifie qu'en administration"
    return None
