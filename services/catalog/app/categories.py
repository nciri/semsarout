"""Catégories produits (constante validée) — reprises à l'identique du monolithe."""

PRODUCT_CATEGORIES = [
    {"id": "lit", "label": "Lit", "group": "furniture"},
    {"id": "canape", "label": "Canapé", "group": "furniture"},
    {"id": "table", "label": "Table", "group": "furniture"},
    {"id": "armoire", "label": "Armoire", "group": "furniture"},
    {"id": "chaise", "label": "Chaise", "group": "furniture"},
    {"id": "bureau", "label": "Bureau", "group": "furniture"},
    {"id": "refrigerateur", "label": "Réfrigérateur", "group": "appliance"},
    {"id": "lave_linge", "label": "Lave-linge", "group": "appliance"},
    {"id": "four", "label": "Four", "group": "appliance"},
    {"id": "micro_ondes", "label": "Micro-ondes", "group": "appliance"},
    {"id": "climatiseur", "label": "Climatiseur", "group": "appliance"},
    {"id": "television", "label": "Télévision", "group": "appliance"},
]
_BY_ID = {c["id"]: c for c in PRODUCT_CATEGORIES}


def is_valid_category(cid) -> bool:
    return cid in _BY_ID


def group_of(cid) -> str | None:
    c = _BY_ID.get(cid)
    return c["group"] if c else None
