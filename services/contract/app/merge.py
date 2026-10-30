"""Construction du contexte de fusion + substitution des {{placeholders}}.

Port de `backend/app/services/contract_merge.py`, adapté aux projections locales
(AgencyRO/TransactionRO/PropertyRO/ClientRO) ; le nom d'agent est résolu en amont.
"""
import re
from datetime import datetime
from html import escape


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
# Les clés de rôle restent sans accent (API, base) ; seul l'affichage en porte.
ROLE_LABELS = {**{r: r for r in ROLE_PLACEHOLDERS}, "acquereur": "acquéreur"}

# Un contrat marocain identifie une partie par son état civil, sa nationalité, son numéro de
# CIN (ou de registre de commerce pour une personne morale) et son domicile. La projection
# locale `ClientRO` ne porte que nom, prénom, courriel et téléphone : la nationalité, la CIN et
# le domicile sortent donc en blanc à compléter dans l'éditeur, plutôt qu'inventés.
A_COMPLETER = "……………………"


def _nom(client) -> str:
    if client is None:
        return ""
    return f"{client.first_name or ''} {client.last_name or ''}".strip()


def _identification(role: str, client) -> str:
    """Une ligne d'identification. `<span>`, `<strong>` et `<br>` passent l'allowlist de
    `sanitize_html`, et restent valides à l'intérieur du `<p>` où les modèles posent le
    placeholder — là où un `<ul>` ou un `<p>` imbriqué casserait le document."""
    nom = _nom(client)
    bits = [f"<strong>{escape(nom, quote=False)}</strong>" if nom else A_COMPLETER,
            f"agissant en qualité de {ROLE_LABELS[role]}",
            f"de nationalité {A_COMPLETER}",
            f"titulaire de la carte nationale d'identité électronique n° {A_COMPLETER}",
            f"demeurant {A_COMPLETER}"]
    for libelle, valeur in (("téléphone", getattr(client, "phone", None)),
                            ("courriel", getattr(client, "email", None))):
        if valeur:
            bits.append(f"{libelle} {escape(str(valeur), quote=False)}")
    return f"<span>{', '.join(bits)}.</span>"


def party_blocks(parties) -> dict:
    """Un bloc HTML d'identification par rôle, sous les noms de placeholders des modèles.

    `parties` : séquence de `(role, client)` déjà ordonnée. `render()` est une simple
    substitution par expression régulière, sans boucle : la liste est donc assemblée ici,
    côté serveur, en une chaîne.

    Un rôle sans partie sort en ligne à compléter — jamais vide (`render()` laisserait un
    article d'identification blanc), et jamais au nom d'une autre partie. Y faire tenir le
    client unique du contrat, faute de mieux, nommerait la même personne bailleur ET
    locataire sur un bail d'avant ce chantier : un blanc se lit comme un champ à remplir,
    un nom sous le mauvais rôle se lit comme une affirmation, dans un acte que l'on signe.
    Le client connu n'est pas perdu pour autant : `{{client_name}}` le résout, le contrat
    garde son `client_id`, et l'éditeur permet de nommer les parties en un clic.
    """
    par_role: dict[str, list] = {}
    for role, client in parties:
        par_role.setdefault(role, []).append(client)
    return {cle: "<br>".join(_identification(role, c) for c in par_role.get(role) or [None])
            for role, cle in ROLE_PLACEHOLDERS.items()}


def build_context(agency, *, transaction=None, property=None, client=None, agent_name="",
                  stay=None, parties=None):
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
    ctx.update(party_blocks(parties or ()))
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
# Les seules valeurs de contexte qui SONT du HTML : `party_blocks` les assemble ici, en
# échappant chaque donnée. Tout le reste est une donnée brute, à échapper (cf. `render`).
_CLES_HTML = frozenset(ROLE_PLACEHOLDERS.values())


def utilise_blocs_de_parties(body_html) -> bool:
    """Le modèle identifie-t-il ses parties par un `{{parties_*}}` ?

    Sert à refuser la génération d'un contrat de 7 à 11 pages qui ne nommerait personne :
    aucun des quatre modèles intégrés n'emploie `{{client_name}}`, donc sans partie le
    document part avec des blancs partout et n'est rattaché à aucun client.
    """
    return any(cle in _CLES_HTML for cle in _PLACEHOLDER.findall(body_html or ""))


def render(body_html, context):
    """Substitution des `{{placeholders}}`, chaque valeur échappée sauf les blocs de parties.

    `sanitize_html` tourne en aval, donc aucun script ne survivait déjà — mais bleach **garde
    `<a href>`**, et `guest_name` arrive d'un calendrier Airbnb/Booking importé, c'est-à-dire
    d'une source réellement non maîtrisée, jusque dans un contrat de séjour généré.
    `_identification` échappait déjà correctement ; c'est la même règle ici.
    """
    if not body_html:
        return ""

    def _valeur(m):
        cle = m.group(1)
        brut = str(context.get(cle, ""))
        return brut if cle in _CLES_HTML else escape(brut, quote=False)

    return _PLACEHOLDER.sub(_valeur, body_html)
