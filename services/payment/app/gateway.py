"""Passerelle CMI — SIMULÉE (même esprit que le mock du monolithe).

En cible, remplacer par l'intégration CMI réelle (pattern séquestre : autorisation →
capture sous séquestre → libération/annulation). L'interface reste stable pour le service.
"""
import secrets


def new_reference() -> str:
    return f"PAY-{secrets.token_hex(4).upper()}"


def gateway_url(reference: str) -> str:
    # URL de paiement simulée (le front existant utilise déjà ce type de redirection).
    return f"/payment-gateway?ref={reference}"


def new_external_ref() -> str:
    return f"CMI-{secrets.token_hex(6).upper()}"
