"""Rendu HTML → PDF (WeasyPrint).

La feuille de style reproduit la mise en page des actes marocains fournis : titre centré,
intitulés d'articles en bandeau sombre, encadrés d'avertissement sur fond crème, tableaux
bordés. Elle vit ici et non dans le HTML stocké parce que l'allowlist produit n'admet
qu'une seule propriété CSS en ligne (`text-align`) : couleurs, fonds et bordures
appartiennent à la présentation, pas au contenu assaini.

WeasyPrint remplace xhtml2pdf parce que les actes existent aussi en arabe. ReportLab, sur
lequel repose xhtml2pdf, ne sait ni former les ligatures arabes ni inverser le sens de
lecture : les versions arabes sortaient en carrés vides, dans l'ordre latin. WeasyPrint
passe par Pango/HarfBuzz, qui font la mise en forme contextuelle et l'algorithme bidi
(UAX #9) — y compris les nombres, qui restent lus de gauche à droite au milieu d'une
phrase arabe.
"""
import re

# Couleurs des documents source (fonds de cellule du .docx) : bandeau 0B1220, encadré F8F1E6.
#
# `Noto Naskh Arabic` est dans la pile de TOUS les documents, pas seulement des actes
# arabes : un acte français qui cite un nom propre ou une mention cadastrale en arabe doit
# le rendre lui aussi. Seul le sens de lecture dépend de la langue dominante.
FEUILLE = """
  @page { margin: 2cm 1.7cm; }
  body { font-family: "DejaVu Sans", "Noto Sans", Arial, "Noto Naskh Arabic", sans-serif;
         font-size: 10.5pt; color: #111; line-height: 1.45; }
  h1 { font-size: 15pt; color: #0B1220; text-align: center; margin: 0 0 2px; }
  h2 { font-size: 12pt; color: #0B1220; margin: 16px 0 6px; }
  h3 { background-color: #0B1220; color: #FFFFFF; font-size: 10.5pt;
       padding: 5px 8px; margin: 14px 0 8px; }
  blockquote { background-color: #F8F1E6; border-left: 3px solid #C9A227;
               padding: 8px 10px; margin: 10px 0; font-size: 9.5pt; color: #3F3222; }
  p { margin: 6px 0; }
  table { width: 100%; margin: 8px 0; border-collapse: collapse; }
  td, th { border: 1px solid #BBBBBB; padding: 4px 6px; font-size: 9.5pt; }
  th { background-color: #F3F4F6; font-weight: bold; }
  /* Un acte arabe est bordé à droite, pas à gauche : la bordure de l'encadré suit le sens
     de lecture au lieu de rester accrochée au bord gauche. */
  [dir="rtl"] blockquote { border-left: 0; border-right: 3px solid #C9A227; }
  /* DejaVu Sans couvre l'arabe, mais d'un dessin linéaire que personne n'emploie pour un
     acte : les actes notariés marocains sont composés en naskh. La police ne passe devant
     que pour un document arabe — un acte français garde sa pile latine. */
  [dir="rtl"] body { font-family: "Noto Naskh Arabic", "DejaVu Sans", serif; }
"""

_ARABE = re.compile(r"[؀-ۿݐ-ݿ]")
_LATIN = re.compile(r"[A-Za-zÀ-ÿ]")


def _sens(texte: str) -> str:
    """Sens de lecture du document, décidé sur la langue qui domine son texte.

    Les actes intégrés existent en deux versions monolingues, mais un modèle rédigé par une
    agence peut mélanger les deux : compter plutôt que supposer évite de retourner un acte
    français parce qu'il cite trois mots d'arabe.
    """
    return "rtl" if len(_ARABE.findall(texte)) > len(_LATIN.findall(texte)) else "ltr"


def _aucune_ressource_externe(url, **_):
    """Refuse toute ressource que le document voudrait aller chercher.

    Le corps d'un acte est du HTML saisi par une agence. WeasyPrint, lui, suit les URL
    qu'il y trouve : un `file:///etc/passwd` ou un `http://169.254.169.254/` ferait du
    service un relais de lecture de fichiers et de requêtes internes. L'allowlist produit
    n'admet aujourd'hui aucune balise qui référence une ressource, mais c'est ici que se
    joue la frontière de confiance — pas dans une liste qu'un autre service fait évoluer.
    Le rendu n'a besoin d'aucun fichier distant : tout est dans `FEUILLE`.

    WeasyPrint convertit ce que lève un `url_fetcher` en avertissement, journalise et
    continue : un acte qui contiendrait malgré tout une référence sort sans elle, au lieu de
    rendre 500 au moment de la finalisation.
    """
    raise ValueError(f"ressource externe refusee dans un acte : {url[:60]}")


# Le drapeau que WeasyPrint lit pour décider si une récupération ratée est fatale. Sans lui,
# sa gestion d'erreur tombe elle-même sur un AttributeError et l'exception remonte.
_aucune_ressource_externe._fail_on_errors = False


def render_pdf_bytes(body_html: str) -> bytes:
    from weasyprint import HTML

    corps = body_html or ""
    html = (f'<html dir="{_sens(corps)}"><head><meta charset="utf-8">'
            f"<style>{FEUILLE}</style></head>"
            f"<body>{corps}</body></html>")
    return HTML(string=html, base_url=None,
                url_fetcher=_aucune_ressource_externe).write_pdf()
