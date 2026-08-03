"""Sanitisation serveur du HTML WYSIWYG (anti-XSS stocké).

Port fidèle de `backend/app/services/html_sanitize.py`.
"""
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
try:
    from bleach.css_sanitizer import CSSSanitizer
    _CSS = CSSSanitizer(allowed_css_properties=["text-align"])
except Exception:  # noqa: BLE001 — vieux bleach
    _CSS = None


def sanitize_html(html):
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
