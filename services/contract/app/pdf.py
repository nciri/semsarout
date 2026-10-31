"""Rendu HTML → PDF (xhtml2pdf) — port de `_render_pdf_bytes` du monolithe.

La feuille de style reproduit la mise en page des actes marocains fournis : titre centré,
intitulés d'articles en bandeau sombre, encadrés d'avertissement sur fond crème, tableaux
bordés. Elle vit ici et non dans le HTML stocké parce que l'allowlist produit n'admet
qu'une seule propriété CSS en ligne (`text-align`) : couleurs, fonds et bordures
appartiennent à la présentation, pas au contenu assaini.
"""
from io import BytesIO

# Couleurs des documents source (fonds de cellule du .docx) : bandeau 0B1220, encadré F8F1E6.
FEUILLE = """
  @page { margin: 2cm 1.7cm; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #111;
         line-height: 1.45; }
  h1 { font-size: 15pt; color: #0B1220; text-align: center; margin: 0 0 2px; }
  h2 { font-size: 12pt; color: #0B1220; margin: 16px 0 6px; }
  h3 { background-color: #0B1220; color: #FFFFFF; font-size: 10.5pt;
       padding: 5px 8px; margin: 14px 0 8px; }
  blockquote { background-color: #F8F1E6; border-left: 3px solid #C9A227;
               padding: 8px 10px; margin: 10px 0; font-size: 9.5pt; color: #3F3222; }
  p { margin: 6px 0; }
  /* `border-collapse` n'est pas implémenté par xhtml2pdf (il le signale) : les bordures
     sont posées par cellule, sans fusion. */
  table { width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #BBBBBB; padding: 4px 6px; font-size: 9.5pt; }
  th { background-color: #F3F4F6; font-weight: bold; }
"""


# Les actes marocains cochent leurs options avec « ☐ » (U+2610), que Helvetica ne sait pas
# dessiner : le PDF rendait un carré vide ou rien du tout, donc une option illisible dans un
# acte signé. Substitué à l'impression seulement — le HTML stocké garde le vrai caractère,
# que le navigateur affiche correctement.
_CASES = {"\u2610": "[  ]", "\u2611": "[x]", "\u2612": "[x]"}


def render_pdf_bytes(body_html: str) -> bytes:
    from xhtml2pdf import pisa

    corps = body_html or ""
    for caractere, remplacement in _CASES.items():
        corps = corps.replace(caractere, remplacement)
    html = (f'<html><head><meta charset="utf-8"><style>{FEUILLE}</style></head>'
            f'<body>{corps}</body></html>')
    buf = BytesIO()
    pisa.CreatePDF(src=html, dest=buf, encoding="utf-8")
    return buf.getvalue()
