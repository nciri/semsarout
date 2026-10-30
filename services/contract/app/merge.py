"""Construction du contexte de fusion + substitution des {{placeholders}}.

Port de `backend/app/services/contract_merge.py`, adapté aux projections locales
(AgencyRO/TransactionRO/PropertyRO/ClientRO) ; le nom d'agent est résolu en amont.
"""
import re
from datetime import datetime


def _money(v):
    try:
        return f"{float(v):,.2f} Đh".replace(",", " ")
    except (TypeError, ValueError):
        return ""


# Placeholders d'identification des parties, un par rôle : les quatre modèles intégrés les
# emploient dans leur article « Entre les soussignés ». `render()` remplace un placeholder
# inconnu par une chaîne vide — une clé manquante ici, c'est un article d'identification des
# parties vide dans un contrat signé.
ROLE_PLACEHOLDERS = {
    "vendeur": "parties_vendeurs",
    "acquereur": "parties_acquereurs",
    "bailleur": "parties_bailleurs",
    "locataire": "parties_locataires",
    "mandant": "parties_mandants",
}


def build_context(agency, *, transaction=None, property=None, client=None, agent_name="",
                  stay=None):
    prop = property
    cli = client
    tx_ref = asking = comm_rate = comm_amount = ""
    if transaction is not None:
        tx_ref = transaction.reference or ""
        asking = _money(transaction.asking_price)
        comm_rate = f"{float(transaction.commission_rate)}%" if transaction.commission_rate is not None else ""
        comm_amount = _money(transaction.commission_amount)

    ctx = {
        "date": datetime.utcnow().strftime("%d/%m/%Y"),
        "agency_name": getattr(agency, "name", "") or "",
        "agency_address": getattr(agency, "address", "") or "",
        "agency_license": getattr(agency, "license_number", "") or "",
        "agent_name": agent_name or "",
        "property_address": getattr(prop, "address", "") or "" if prop else "",
        "property_city": getattr(prop, "city", "") or "" if prop else "",
        "property_type": getattr(prop, "property_type", "") or "" if prop else "",
        "property_price": _money(getattr(prop, "price", None)) if prop else "",
        "property_surface": (f"{prop.surface} m²" if prop and prop.surface else ""),
        "property_rooms": str(getattr(prop, "rooms", "") or "") if prop else "",
        "property_reference": getattr(prop, "reference", "") or "" if prop else "",
        "client_name": (f"{cli.first_name} {cli.last_name}" if cli else ""),
        "client_email": getattr(cli, "email", "") or "" if cli else "",
        "client_phone": getattr(cli, "phone", "") or "" if cli else "",
        "transaction_reference": tx_ref,
        "asking_price": asking,
        "commission_rate": comm_rate,
        "commission_amount": comm_amount,
    }
    # Repli provisoire : le client unique du contrat tient tous les rôles, le temps que la
    # saisie de parties plurielles arrive. Mieux vaut le même nom dans deux rôles qu'un blanc.
    ctx.update(dict.fromkeys(ROLE_PLACEHOLDERS.values(), ctx["client_name"]))
    if stay:
        ctx.update(stay_context(stay))
    return ctx


# Variables propres au contrat de séjour. Elles décrivent la location elle-même (dates,
# occupants, montant) : un bail de longue durée n'en a pas l'usage, et les mélanger aux
# variables de transaction rendrait un modèle illisible.
STAY_PLACEHOLDERS = (
    "stay_property", "stay_check_in", "stay_check_out", "stay_nights", "stay_guests",
    "stay_total", "stay_cleaning_fee", "guest_name", "guest_email", "guest_phone",
)


def _day(value) -> str:
    raw = str(value or "")[:10]
    if len(raw) != 10:
        return ""
    year, month, day = raw.split("-")
    return f"{day}/{month}/{year}"


def stay_context(stay: dict) -> dict:
    """Contexte d'un séjour, tel que staymanager le transmet (dates ISO, montants nombres)."""
    return {
        "stay_property": stay.get("property_title") or "",
        "stay_check_in": _day(stay.get("check_in")),
        "stay_check_out": _day(stay.get("check_out")),
        "stay_nights": str(stay.get("nights") or ""),
        "stay_guests": str(stay.get("guest_count") or ""),
        "stay_total": _money(stay.get("total_price")) if stay.get("total_price") else "",
        "stay_cleaning_fee": _money(stay.get("cleaning_fee")) if stay.get("cleaning_fee") else "",
        "guest_name": stay.get("guest_name") or "",
        "guest_email": stay.get("guest_email") or "",
        "guest_phone": stay.get("guest_phone") or "",
    }


_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def render(body_html, context):
    if not body_html:
        return ""
    return _PLACEHOLDER.sub(lambda m: str(context.get(m.group(1), "")), body_html)
