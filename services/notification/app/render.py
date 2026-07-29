"""Rendu des emails HTML au design SemsarOut (Jinja2, **autoescape**).

`render_email(name, **ctx)` → `(subject, html, text)`. L'autoescape neutralise toute injection
HTML via les variables (nom, message…) — sûr par défaut. Chaque gabarit `templates/*.html` étend
`base.html` et définit les blocs `subject`, `preheader`, `content`.
"""
import html as _html
import os
import re
from datetime import datetime

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")

_env = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)

# Palette de marque (cf. frontend/tailwind.config.js) — accessible dans tous les gabarits.
_env.globals["brand"] = {
    "gold": "#C6923F", "gold_dark": "#A9781F", "gold_soft": "#FBF5EA",
    "dark": "#0B1220", "ivory": "#FAF9F7", "teal": "#0F766E",
    "text": "#1f2937", "muted": "#6b7280", "border": "#ececec",
}


def _globals() -> dict:
    return {"app": {"name": "SemsarOut",
                    "base_url": os.environ.get("PUBLIC_BASE_URL", "http://localhost:5600"),
                    "year": datetime.now().year}}


def html_to_text(html: str) -> str:
    """Version texte/plain minimale (repli des clients sans HTML) : liens conservés en clair."""
    html = re.sub(r"(?is)<(style|script|title|head).*?</\1>", "", html)
    html = re.sub(r'(?is)<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', r"\2 (\1)", html)
    html = re.sub(r"(?is)<br\s*/?>", "\n", html)
    html = re.sub(r"(?is)</(p|div|tr|h[1-6]|li)>", "\n", html)
    text = re.sub(r"(?s)<[^>]+>", "", html)
    text = _html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()


def render_email(template: str, **ctx) -> tuple[str, str, str]:
    """`template` = nom du fichier (ex. "password_reset.html"). `ctx` = variables du gabarit
    (dont `name`, sans collision avec le nom du gabarit)."""
    ctx = {**_globals(), **ctx}
    tmpl = _env.get_template(template)
    context = tmpl.new_context(ctx)
    subject = "".join(tmpl.blocks["subject"](context)).strip() if "subject" in tmpl.blocks else "SemsarOut"
    html = tmpl.render(ctx)
    return subject, html, html_to_text(html)
