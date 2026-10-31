"""Construction du contexte de fusion + substitution des {{placeholders}}.

Port de `backend/app/services/contract_merge.py`, adapté aux projections locales
(AgencyRO/TransactionRO/PropertyRO/ClientRO) ; le nom d'agent est résolu en amont.
"""
import re
from datetime import datetime
from html import escape


def _money(v):
    try:
        return f"{float(v):,.2f} Dh".replace(",", " ")
    except (TypeError, ValueError):
        return ""


def _nombre(v):
    """Montant ou mesure NU : « 1 500 000 », « 120 », « 2,5 ». Sans symbole ni unité.

    Les cinq actes marocains écrivent eux-mêmes « MAD », « m² » ou « % » après le champ :
    `_money` y produirait « 1 500 000,00 Dh MAD », et `property_surface` « 120.0 m² m² ».
    Les décimales ne sortent que si elles existent, un acte n'écrivant pas « 120,00 m² ».
    """
    try:
        f = float(v)
    except (TypeError, ValueError):
        return ""
    entier, _, dec = f"{f:,.2f}".replace(",", " ").partition(".")
    return entier if dec == "00" else f"{entier},{dec.rstrip('0')}"


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

# Nom NU des parties d'un rôle, sans la ligne d'identification complète de `ROLE_PLACEHOLDERS`.
# Les actes marocains énumèrent eux-mêmes les mentions d'état civil (« , CNIE n° …,
# demeurant … ») : y insérer le bloc complet les écrirait deux fois. Ces placeholders ne
# rendent donc que les noms, joints par « et » — « Sara Bennani et Omar Tazi ».
ROLE_NAME_PLACEHOLDERS = {
    "vendeur": "nom_vendeurs",
    "acquereur": "nom_acquereurs",
    "bailleur": "nom_bailleurs",
    "locataire": "nom_locataires",
    "mandant": "nom_mandants",
}

# Les deux seules valeurs que le serveur RÉDIGE (le reste est un nom, un nombre ou une
# adresse, identiques dans les deux langues). Un acte arabe qui afficherait « appartement »
# ou « 4 pièces, étage 2 » en français ne serait pas signable.
# Relecture par un arabophone natif encore à faire (cf. chantier i18n).
TYPES_BIEN = {
    "apartment": ("appartement", "شقة"),
    "house": ("maison", "منزل"),
    "villa": ("villa", "فيلا"),
    "riad": ("riad", "رياض"),
    "land": ("terrain", "أرض"),
    "commercial": ("local commercial", "محل تجاري"),
    "office": ("bureau", "مكتب"),
    "garage": ("garage / parking", "جراج"),
}
_CONSISTANCE = {
    "fr": ("{n} pièces", "{n} chambres", "{n} salles de bain", "étage {n}", ", "),
    "ar": ("{n} غرف", "{n} غرف نوم", "{n} حمامات", "الطابق {n}", "، "),
}
_LANGUES = ("fr", "ar")

# Un contrat marocain identifie une partie par son état civil, sa nationalité, son numéro de
# CIN (ou de registre de commerce pour une personne morale) et son domicile. La projection
# locale `ClientRO` ne porte que nom, prénom, courriel et téléphone : la nationalité, la CIN et
# le domicile sortent donc en blanc à compléter dans l'éditeur, plutôt qu'inventés.
A_COMPLETER = "……………………"


def _type_bien(code, lang="fr") -> str:
    libelles = TYPES_BIEN.get(code or "")
    return libelles[0 if lang == "fr" else 1] if libelles else (code or "")


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


def role_names(parties, lang="fr") -> dict:
    """Noms des parties par rôle, joints par « et » / « و ». Un rôle sans partie sort en
    pointillés : un acte qui ne nomme personne doit se lire comme un champ à remplir."""
    liaison = " et " if lang == "fr" else " و "
    par_role: dict[str, list] = {}
    for role, client in parties:
        par_role.setdefault(role, []).append(client)
    return {cle: liaison.join(_nom(c) for c in par_role[role] if _nom(c)) or A_COMPLETER
            if par_role.get(role) else A_COMPLETER
            for role, cle in ROLE_NAME_PLACEHOLDERS.items()}


def _loyer_mensuel(prop) -> str:
    """Loyer mensuel NU, ou rien si le bien n'en a pas.

    `price` porte un prix de vente sur un bien en vente : un bail généré dessus écrivait ce
    prix en « loyer mensuel ». La location courte durée (`price_period` au jour ou à la
    semaine) n'est pas non plus un loyer mensuel. Hors de ces deux cas, le champ retombe sur
    les pointillés plutôt que d'affirmer un montant faux dans un acte signé.
    """
    if getattr(prop, "transaction_type", None) != "rent":
        return ""
    if getattr(prop, "price_period", None) not in (None, "", "month"):
        return ""
    return _nombre(getattr(prop, "price", None))


def _consistance(prop, lang="fr") -> str:
    """« 4 pièces, 2 chambres, étage 3 » — la composition que les actes demandent en clair."""
    pieces, chambres, bains, etage, sep = _CONSISTANCE.get(lang, _CONSISTANCE["fr"])
    bouts = []
    for gabarit, valeur in ((pieces, getattr(prop, "rooms", None)),
                            (chambres, getattr(prop, "bedrooms", None)),
                            (bains, getattr(prop, "bathrooms", None)),
                            (etage, getattr(prop, "floor", None))):
        if valeur:
            bouts.append(gabarit.format(n=valeur))
    return sep.join(bouts)


def build_context(agency, *, transaction=None, property=None, client=None, agent_name="",
                  stay=None, parties=None, lang="fr"):
    lang = lang if lang in _LANGUES else "fr"
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
        "agency_city": getattr(agency, "city", "") or "",
        "agency_phone": getattr(agency, "phone", "") or "",
        "agency_email": getattr(agency, "email", "") or "",
        # Un mandat marocain nomme l'agence par son registre du commerce et son ICE.
        "agency_rc": getattr(agency, "rc_number", "") or "",
        "agency_ice": getattr(agency, "ice_number", "") or "",
        "agent_name": agent_name or "",
        "property_address": getattr(prop, "address", "") or "" if prop else "",
        "property_city": getattr(prop, "city", "") or "" if prop else "",
        # Le type est un code en base (`apartment`, `riad`) : les modèles affichaient le code.
        "property_type": _type_bien(getattr(prop, "property_type", ""), lang) if prop else "",
        "property_price": _money(getattr(prop, "price", None)) if prop else "",
        "property_surface": (f"{prop.surface} m²" if prop and prop.surface else ""),
        "property_rooms": str(getattr(prop, "rooms", "") or "") if prop else "",
        "property_reference": getattr(prop, "reference", "") or "" if prop else "",
        "property_title": getattr(prop, "title", "") or "" if prop else "",
        "property_neighborhood": getattr(prop, "neighborhood", "") or "" if prop else "",
        "property_postal_code": getattr(prop, "postal_code", "") or "" if prop else "",
        "property_floor": str(getattr(prop, "floor", "") or "") if prop else "",
        "property_bedrooms": str(getattr(prop, "bedrooms", "") or "") if prop else "",
        "property_bathrooms": str(getattr(prop, "bathrooms", "") or "") if prop else "",
        "property_construction_year": str(getattr(prop, "construction_year", "") or "") if prop else "",
        "property_consistance": _consistance(prop, lang) if prop else "",
        # Variantes nues : les actes écrivent « MAD », « m² » et « % » eux-mêmes.
        "property_surface_nombre": _nombre(getattr(prop, "surface", None)) if prop else "",
        "property_land_surface_nombre": _nombre(getattr(prop, "land_surface", None)) if prop else "",
        "property_price_nombre": _nombre(getattr(prop, "price", None)) if prop else "",
        "property_rent_nombre": _loyer_mensuel(prop) if prop else "",
        "property_charges_nombre": _nombre(getattr(prop, "charges", None)) if prop else "",
        "property_condo_fees_nombre": _nombre(getattr(prop, "condo_fees", None)) if prop else "",
        "client_name": (f"{cli.first_name} {cli.last_name}" if cli else ""),
        "client_email": getattr(cli, "email", "") or "" if cli else "",
        "client_phone": getattr(cli, "phone", "") or "" if cli else "",
        "transaction_reference": tx_ref,
        "asking_price": asking,
        "commission_rate": comm_rate,
        "commission_amount": comm_amount,
        "asking_price_nombre": _nombre(getattr(transaction, "asking_price", None)) if transaction is not None else "",
        "commission_rate_nombre": _nombre(getattr(transaction, "commission_rate", None)) if transaction is not None else "",
        "commission_amount_nombre": _nombre(getattr(transaction, "commission_amount", None)) if transaction is not None else "",
    }
    ctx.update(party_blocks(parties or ()))
    ctx.update(role_names(parties or (), lang))
    for cle in CHAMPS_A_COMPLETER:
        if not ctx.get(cle):
            ctx[cle] = A_COMPLETER
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


# Un champ d'acte non renseigné doit se LIRE comme un champ à remplir. `render()` remplace
# une valeur absente par une chaîne vide : une agence sans numéro de registre du commerce en
# base produirait « RC n° , ICE , siège » dans un mandat signé — un blanc muet que personne
# ne remarque à la relecture. Ces clés retombent donc sur les pointillés, comme le fait déjà
# `party_blocks` pour un rôle sans partie.
# N'y figurent pas : `date` (toujours résolue), `client_name` (le client du contrat, dont
# l'absence est significative) et les variables de séjour, propres à un flux qui les remplit.
CHAMPS_A_COMPLETER = frozenset({
    "agency_name", "agency_address", "agency_license", "agency_city", "agency_phone",
    "agency_email", "agency_rc", "agency_ice", "agent_name",
    "property_address", "property_city", "property_type", "property_title",
    "property_neighborhood", "property_postal_code", "property_floor", "property_bedrooms",
    "property_bathrooms", "property_rooms", "property_construction_year",
    "property_consistance", "property_reference", "property_surface", "property_price",
    "property_surface_nombre", "property_land_surface_nombre", "property_price_nombre",
    "property_charges_nombre", "property_condo_fees_nombre", "property_rent_nombre",
    "transaction_reference", "asking_price", "asking_price_nombre",
    "commission_rate", "commission_rate_nombre", "commission_amount",
    "commission_amount_nombre", "client_phone", "client_email",
})

_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
# Les seules valeurs de contexte qui SONT du HTML : `party_blocks` les assemble ici, en
# échappant chaque donnée. Tout le reste est une donnée brute, à échapper (cf. `render`).
_CLES_HTML = frozenset(ROLE_PLACEHOLDERS.values())
# Identification des parties, sous l'une ou l'autre forme : bloc HTML complet, ou nom nu.
_CLES_IDENTIFICATION = _CLES_HTML | frozenset(ROLE_NAME_PLACEHOLDERS.values())


def utilise_blocs_de_parties(body_html) -> bool:
    """Le modèle identifie-t-il ses parties par un `{{parties_*}}` ?

    Sert à refuser la génération d'un contrat de 7 à 11 pages qui ne nommerait personne :
    aucun des quatre modèles intégrés n'emploie `{{client_name}}`, donc sans partie le
    document part avec des blancs partout et n'est rattaché à aucun client.
    """
    return any(cle in _CLES_IDENTIFICATION for cle in _PLACEHOLDER.findall(body_html or ""))


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
