"""Server-side sanitization of WYSIWYG HTML (prevents stored XSS)."""
import bleach

ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
                'h1', 'h2', 'h3', 'h4', 'blockquote', 'table', 'thead', 'tbody',
                'tr', 'td', 'th', 'span', 'a']
ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
    '*': ['style'],
}
ALLOWED_PROTOCOLS = ['http', 'https', 'mailto']
try:
    from bleach.css_sanitizer import CSSSanitizer
    _CSS = CSSSanitizer(allowed_css_properties=['text-align'])
except Exception:  # older bleach
    _CSS = None


def sanitize_html(html):
    if not html:
        return ''
    kwargs = dict(tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES,
                  protocols=ALLOWED_PROTOCOLS, strip=True)
    if _CSS is not None:
        kwargs['css_sanitizer'] = _CSS
    return bleach.clean(html, **kwargs)
