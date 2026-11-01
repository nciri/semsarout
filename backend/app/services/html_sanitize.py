"""Server-side sanitization of WYSIWYG HTML (prevents stored XSS).

Same whitelist as `libs/semsar_common/semsar_common/html_sanitize.py`, which is the one the
microservices share. The copy stays local on purpose: the monolith does not declare
`semsar-common` as a dependency, and adding a cross-boundary import for 30 lines would be a
packaging change, not a fix. Keep the two in step — the shared lib is the reference.
"""
import re

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


# `strip=True` removes the tag but keeps its text: a pasted `<script>alert(1)</script>` would
# surface as the visible words "alert(1)". These elements have no displayable content, or they
# change the namespace / parsing mode (`svg`, `math`, `template`, `noscript` — the classic mXSS
# vector): the whole subtree goes. Same list as the shared lib, so the two layers converge.
DROPPED_SUBTREES = ('script', 'style', 'svg', 'math', 'template', 'noscript', 'iframe',
                    'object', 'embed', 'base', 'link', 'meta', 'frame', 'frameset',
                    'applet', 'form')
_SUBTREE = re.compile(
    r'<\s*(' + '|'.join(DROPPED_SUBTREES) + r')\b[^>]*>.*?<\s*/\s*\1\s*>',
    re.IGNORECASE | re.DOTALL)


def sanitize_html(html):
    if not html:
        return ''
    html = str(html)
    # Nestings and tags rewritten by the previous pass: repeat to a fixed point.
    for _ in range(4):
        stripped = _SUBTREE.sub('', html)
        if stripped == html:
            break
        html = stripped
    attributes = dict(ALLOWED_ATTRIBUTES)
    kwargs = dict(tags=ALLOWED_TAGS, protocols=ALLOWED_PROTOCOLS, strip=True)
    if _CSS is not None:
        kwargs['css_sanitizer'] = _CSS
    else:
        # Without a CSS sanitizer, bleach keeps `style` values verbatim
        # (CSS url() vector). Fail closed by dropping `style` entirely.
        attributes = {k: [a for a in v if a != 'style'] for k, v in attributes.items()}
        attributes = {k: v for k, v in attributes.items() if v}
    kwargs['attributes'] = attributes
    return bleach.clean(html, **kwargs)


_BLOCK_END = re.compile(r"</(?:p|div|li|tr|h[1-4]|blockquote|table|ul|ol)\s*>|<br\s*/?>",
                        re.IGNORECASE)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t]*\n[ \t]*")


def html_to_text(html):
    """Plain text of a WYSIWYG field, for surfaces that cannot render HTML."""
    if not html:
        return ''
    text = _TAG.sub('', _BLOCK_END.sub('\n', _SUBTREE.sub('', str(html))))
    text = bleach.clean(text, tags=[], attributes={}, strip=True)
    for entity, char in (('&nbsp;', ' '), ('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'),
                         ('&quot;', '"'), ('&#x27;', "'"), ('&#39;', "'")):
        text = text.replace(entity, char)
    return re.sub(r'\n{3,}', '\n\n', _WS.sub('\n', text)).strip()


def sanitize_rich_field(html):
    """Storable value of a WYSIWYG field: sanitized HTML, or `None` when empty.

    An emptied `contentEditable` yields `<p><br></p>` — valid HTML with no content. Stored
    as-is it would make every `if field:` in a template or a screen true.
    """
    clean = sanitize_html(html)
    return clean or None if html_to_text(clean) else None
