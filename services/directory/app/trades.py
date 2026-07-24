"""Métiers d'artisans (constante validée) — reprise à l'identique du monolithe."""

ARTISAN_TRADES = [
    {"id": "plombier", "label": "Plombier"},
    {"id": "electricien", "label": "Électricien"},
    {"id": "menage", "label": "Ménage"},
    {"id": "menuisier", "label": "Menuisier"},
    {"id": "peintre", "label": "Peintre"},
    {"id": "archi_interieur", "label": "Architecte d'intérieur"},
    {"id": "macon", "label": "Maçon"},
    {"id": "chauffagiste", "label": "Chauffagiste"},
    {"id": "serrurier", "label": "Serrurier"},
    {"id": "jardinier", "label": "Jardinier"},
    {"id": "autre", "label": "Autre"},
]
_TRADE_IDS = {t["id"] for t in ARTISAN_TRADES}


def is_valid_trade(trade) -> bool:
    return trade in _TRADE_IDS
