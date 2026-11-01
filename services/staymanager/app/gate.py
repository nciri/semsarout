"""Porte d'accès des séjours courte durée : agence rattachée + plan `has_staymanager_sync`.

Dans son module à elle parce que les routes du ménage (`app/cleaning.py`) l'exigent autant
que celles des calendriers : laissée dans `main.py`, elle imposerait un import circulaire.
"""
from semsar_auth import Principal

from . import billing_client
from .util import err


def gate(principal: Principal):
    """Parité require_staymanager_feature : agence + plan has_staymanager_sync."""
    if principal.agency_id is None:
        return err("Agence requise", 403)
    sub = billing_client.subscription(principal.agency_id)
    if not sub or sub.get("status") != "active" or not sub.get("has_staymanager_sync"):
        return err("Cette fonctionnalite necessite le plan Pro ou superieur", 403, upgrade_required=True)
    return None
