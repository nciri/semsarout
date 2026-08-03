"""Rendu HTML → PDF (xhtml2pdf) — port de `_render_pdf_bytes` du monolithe."""
from io import BytesIO


def render_pdf_bytes(body_html: str) -> bytes:
    from xhtml2pdf import pisa

    html = f"""<html><head><meta charset="utf-8"><style>
      body {{ font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #111; }}
      h1,h2,h3 {{ color: #1e3a5f; }} table {{ border-collapse: collapse; width: 100%; }}
      td,th {{ border: 1px solid #ccc; padding: 4px; }}
    </style></head><body>{body_html or ''}</body></html>"""
    buf = BytesIO()
    pisa.CreatePDF(src=html, dest=buf, encoding="utf-8")
    return buf.getvalue()
