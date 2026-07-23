"""Fixed list of artisan trades (validated)."""

ARTISAN_TRADES = [
    {'id': 'plombier', 'label': 'Plombier'},
    {'id': 'electricien', 'label': 'Électricien'},
    {'id': 'menage', 'label': 'Ménage'},
    {'id': 'menuisier', 'label': 'Menuisier'},
    {'id': 'peintre', 'label': 'Peintre'},
    {'id': 'archi_interieur', 'label': "Architecte d'intérieur"},
    {'id': 'macon', 'label': 'Maçon'},
    {'id': 'chauffagiste', 'label': 'Chauffagiste'},
    {'id': 'serrurier', 'label': 'Serrurier'},
    {'id': 'jardinier', 'label': 'Jardinier'},
    {'id': 'autre', 'label': 'Autre'},
]
TRADE_IDS = {t['id'] for t in ARTISAN_TRADES}


def is_valid_trade(trade):
    return trade in TRADE_IDS
