"""Sanitisation du HTML WYSIWYG — une seule liste blanche pour tout le produit.

Tous les champs texte de SemsarOut sont saisis en WYSIWYG : ce qui est stocké est donc du
HTML, et un champ non assaini est un XSS stocké déclenché par la première page qui l'affiche.
La fonction vit ici, et non dans un service, parce que la liste blanche doit être la même
partout : `contract`, `crm`, `listing`, `staymanager`… `strip=True` supprime les balises
interdites au lieu de les échapper, pour qu'un collage depuis Word ne laisse pas de `<o:p>`
visibles dans le texte.

`html_to_text` sert aux surfaces qui ne savent pas afficher de HTML (index de recherche,
aperçu d'une cellule de tableau, email en texte brut).
"""
import re

import bleach

ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li",
                "h1", "h2", "h3", "h4", "blockquote", "table", "thead", "tbody",
                "tr", "td", "th", "span", "a"]
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title"],
    "td": ["colspan", "rowspan"],
    "th": ["colspan", "rowspan"],
    "*": ["style"],
}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]
ALLOWED_CSS_PROPERTIES = ["text-align"]

try:
    from bleach.css_sanitizer import CSSSanitizer
    _CSS = CSSSanitizer(allowed_css_properties=ALLOWED_CSS_PROPERTIES)
except Exception:  # noqa: BLE001 — vieux bleach
    _CSS = None

# Les balises qui marquent une fin de bloc : leur disparition ne doit pas coller deux mots.
_BLOCK_END = re.compile(r"</(?:p|div|li|tr|h[1-4]|blockquote|table|ul|ol)\s*>|<br\s*/?>",
                        re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t]*\n[ \t]*")


def sanitize_html(html):
    """HTML assaini selon la liste blanche produit. `None`/vide → `""`."""
    if not html:
        return ""
    attributes = dict(ALLOWED_ATTRIBUTES)
    kwargs = dict(tags=ALLOWED_TAGS, protocols=ALLOWED_PROTOCOLS, strip=True)
    if _CSS is not None:
        kwargs["css_sanitizer"] = _CSS
    else:
        attributes = {k: [a for a in v if a != "style"] for k, v in attributes.items()}
        attributes = {k: v for k, v in attributes.items() if v}
    kwargs["attributes"] = attributes
    return bleach.clean(html, **kwargs)


def html_to_text(html):
    """Texte brut d'un champ WYSIWYG, pour les surfaces qui n'affichent pas de HTML."""
    if not html:
        return ""
    text = _BLOCK_END.sub("\n", str(html))
    text = _TAG.sub("", text)
    text = bleach.clean(text, tags=[], attributes={}, strip=True)
    # `clean` réintroduit les entités : on rend le texte lisible, pas du HTML.
    for entity, char in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                         ("&quot;", '"'), ("&#x27;", "'"), ("&#39;", "'")):
        text = text.replace(entity, char)
    text = _WS.sub("\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()
