"""Sanitisation serveur du HTML WYSIWYG (anti-XSS stocké).

La liste blanche est désormais produit-wide et vit dans `semsar_common` : tous les champs du
projet étant en WYSIWYG, deux listes divergentes auraient fini par laisser passer ici ce
qu'un autre service refuse. Ce module reste l'import historique du service `contract`.
"""
from semsar_common.html_sanitize import (
    ALLOWED_ATTRIBUTES,
    ALLOWED_PROTOCOLS,
    ALLOWED_TAGS,
    html_to_text,
    sanitize_html,
)

__all__ = ["ALLOWED_TAGS", "ALLOWED_ATTRIBUTES", "ALLOWED_PROTOCOLS", "sanitize_html",
           "html_to_text"]
