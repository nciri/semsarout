"""Rendu HTML → PDF (WeasyPrint).

La feuille de style reproduit la mise en page des actes marocains fournis en .docx. Toutes
les valeurs ci-dessous sont relevées dans les fichiers source (`docs/contracts_models/`),
pas approchées à l'œil : couleurs de police et de fond, épaisseurs de filet, marges de page,
retraits, interligne. Elles vivent ici et non dans le HTML stocké parce que l'allowlist
produit n'admet qu'une seule propriété CSS en ligne (`text-align`) : la présentation
n'appartient pas au contenu assaini.

WeasyPrint remplace xhtml2pdf parce que les actes existent aussi en arabe. ReportLab, sur
lequel repose xhtml2pdf, ne sait ni former les ligatures arabes ni inverser le sens de
lecture : les versions arabes sortaient en carrés vides, dans l'ordre latin. WeasyPrint
passe par Pango/HarfBuzz, qui font la mise en forme contextuelle et l'algorithme bidi
(UAX #9) — y compris les nombres, qui restent lus de gauche à droite au milieu d'une
phrase arabe.
"""
import re
from html import escape

# Valeurs relevées dans les .docx (w:color, w:shd/@w:fill, w:pBdr, w:tcBorders, w:sectPr).
# Les épaisseurs Word sont en huitièmes de point : sz="18" → 2.25pt, sz="24" → 3pt.
ENCRE = "#334155"          # couleur du corps de texte
ENCRE_FORTE = "#0B1220"    # titre, fond des bandeaux d'article
TEAL = "#0F766E"           # sous-titre sous le titre
ROUGE = "#C1121F"          # filet sous le sous-titre
OCRE = "#C6923F"           # barre gauche des bandeaux et de l'encadré
CREME = "#F8F1E6"          # fond de l'encadré d'avertissement
IVOIRE = "#FAF9F7"         # fond du bloc de signatures
GRILLE = "#E5E7EB"         # filets des tableaux
GRIS = "#64748B"           # en-tête et pied de page

# Calibri est la police des documents source. Carlito en est le clone libre aux mêmes
# métriques : à défaut, les césures et la pagination ne tomberaient pas au même endroit.
# `Noto Naskh Arabic` est dans la pile de TOUS les documents, pas seulement des actes
# arabes : un acte français qui cite un nom propre ou une mention cadastrale en arabe doit
# le rendre lui aussi. Seul le sens de lecture dépend de la langue dominante.
PILE = 'Calibri, Carlito, "DejaVu Sans", sans-serif'

FEUILLE = f"""
  @page {{
    margin: 1.94cm 1.91cm 1.76cm;
    /* Les trois boîtes du haut portent le même filet pour qu'il traverse la page, comme
       la bordure basse du paragraphe d'en-tête dans le .docx. */
    @top-left {{ content: ""; border-bottom: 0.5pt solid {GRILLE}; }}
    @top-center {{ content: ""; border-bottom: 0.5pt solid {GRILLE}; }}
    @top-right {{
      content: string(entete);
      font-family: {PILE}; font-size: 8pt; color: {GRIS};
      border-bottom: 0.5pt solid {GRILLE}; padding-bottom: 4pt;
    }}
    @bottom-center {{
      /* Espaces insécables : les espaces ordinaires d'une chaîne `content` se replient en
         un seul, et le pied de page perdrait l'écart du .docx entre paraphes et pagination. */
      content: "{{paraphes}}\\00a0\\00a0\\00a0________\\00a0\\00a0\\00a0________"
               "\\00a0\\00a0\\00a0\\00a0\\00a0\\00a0{{page}}\\00a0" counter(page) " / " counter(pages);
      font-family: {PILE}; font-size: 8pt; color: {GRIS};
    }}
  }}
  /* Le .docx demande un interligne « multiple 1,15 » (w:line="276"), que Word applique à une
     ligne incluant déjà l'interlignage de la police. 1.25em le reproduit sur Carlito : c'est
     la valeur qui fait tomber les coupures de page au même endroit que le document source,
     mesuré sur les cinq actes. */
  body {{ font-family: {PILE}; font-size: 10pt; color: {ENCRE}; line-height: 1.25; }}
  p {{ margin: 0 0 5pt; }}

  h1 {{ font-size: 17pt; color: {ENCRE_FORTE}; text-align: center; margin: 0 0 4pt;
       line-height: 1.2; }}
  /* Le sous-titre est le paragraphe qui suit le titre ; le filet rouge est porté par le
     paragraphe vide d'après, exactement comme dans le .docx. */
  h1 + p {{ font-size: 8.5pt; color: {TEAL}; text-align: center; }}
  h1 + p + p:empty {{ border-bottom: 2.25pt solid {ROUGE}; }}

  h2 {{ font-size: 11pt; color: {ENCRE_FORTE}; margin: 0 0 5pt; }}
  /* Bandeau d'article : cellule à fond sombre et barre ocre à gauche dans le .docx.
     Marges nulles : dans le document source, les tableaux n'ont pas d'espacement propre —
     ce sont les paragraphes vides alentour qui aèrent. Leur en donner un ici décalerait
     toutes les coupures de page. */
  h3, h4 {{ background-color: {ENCRE_FORTE}; color: #FFFFFF; font-size: 10pt;
            border-left: 3pt solid {OCRE}; padding: 3.5pt 8pt; margin: 0; }}

  blockquote {{ background-color: {CREME}; border-left: 2.25pt solid {OCRE};
                padding: 6pt 8pt; margin: 0; text-align: justify; }}
  blockquote p {{ margin: 0 0 5pt; }}
  blockquote p:last-child {{ margin-bottom: 0; }}

  /* Les énumérations des actes sont de simples paragraphes en retrait de 280 twips (14 pt),
     préfixés d'un tiret dans le texte : pas de puce à ajouter par-dessus. */
  ul, ol {{ margin: 0 0 5pt; padding-left: 14pt; list-style: none; }}
  li {{ margin: 0 0 5pt; }}

  /* Un paragraphe vide du .docx occupe une ligne entière, et c'est lui qui aère l'acte. */
  p:empty::before {{ content: "\\00a0"; }}

  table {{ width: 100%; margin: 0; border-collapse: collapse; }}
  td, th {{ border: 0.5pt solid {GRILLE}; padding: 3pt 5pt; font-size: 9pt;
            vertical-align: top; }}
  th {{ background-color: {ENCRE_FORTE}; color: #FFFFFF; font-weight: bold; }}

  /* Bloc de signatures : fond ivoire, filet ocre en haut, cases hautes pour signer.
     ponytail: repéré comme le dernier tableau du corps, ce qu'il est dans les dix actes
     source ; un marqueur dans le HTML demanderait d'ouvrir l'allowlist à un attribut. */
  body > table:last-of-type td {{ background-color: {IVOIRE}; border-top: 1.5pt solid {OCRE};
                                  text-align: center; height: 62pt; padding: 6pt 8pt 4pt; }}

  /* Un acte arabe est bordé à droite, pas à gauche : barres et retraits suivent le sens
     de lecture au lieu de rester accrochés au bord gauche. */
  [dir="rtl"] h3, [dir="rtl"] h4, [dir="rtl"] blockquote {{
      border-left: 0; border-right-style: solid; border-right-color: {OCRE}; }}
  [dir="rtl"] h3, [dir="rtl"] h4 {{ border-right-width: 3pt; }}
  [dir="rtl"] blockquote {{ border-right-width: 2.25pt; }}
  [dir="rtl"] ul, [dir="rtl"] ol {{ padding-left: 0; padding-right: 14pt; }}
  /* DejaVu Sans couvre l'arabe, mais d'un dessin linéaire que personne n'emploie pour un
     acte : les actes notariés marocains sont composés en naskh. La police ne passe devant
     que pour un document arabe — un acte français garde sa pile latine. */
  [dir="rtl"] body {{ font-family: "Noto Naskh Arabic", "DejaVu Sans", serif; }}
"""

# Libellés du pied de page, relevés dans les .docx de chaque langue. Un acte arabe portait
# sinon un pied de page français, ce qu'aucune des deux versions signées ne dit.
PIED = {"ltr": ("Paraphes :", "Page"), "rtl": ("الأحرف الأولى:", "الصفحة")}

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
    Le rendu n'a besoin d'aucun fichier distant : polices et styles viennent du système.

    WeasyPrint convertit ce que lève un `url_fetcher` en avertissement, journalise et
    continue : un acte qui contiendrait malgré tout une référence sort sans elle, au lieu de
    rendre 500 au moment de la finalisation.
    """
    raise ValueError(f"ressource externe refusee dans un acte : {url[:60]}")


# Le drapeau que WeasyPrint lit pour décider si une récupération ratée est fatale. Sans lui,
# sa gestion d'erreur tombe elle-même sur un AttributeError et l'exception remonte.
_aucune_ressource_externe._fail_on_errors = False


def render_pdf_bytes(body_html: str, titre: str = "") -> bytes:
    """PDF de l'acte. `titre` est repris en en-tête de chaque page, comme dans les .docx."""
    from weasyprint import HTML

    corps = body_html or ""
    sens = _sens(corps)
    paraphes, page = PIED[sens]
    feuille = FEUILLE.replace("{paraphes}", paraphes).replace("{page}", page)
    # `string-set` alimente `string(entete)` des boîtes de marge : c'est le seul moyen de
    # faire remonter un texte du document vers l'en-tête de page.
    entete = (f"<div style=\"string-set: entete '{escape(titre, quote=True)}'\"></div>"
              if titre else "")
    html = (f'<html dir="{sens}"><head><meta charset="utf-8">'
            f"<style>{feuille}</style></head>"
            f"<body>{entete}{corps}</body></html>")
    return HTML(string=html, base_url=None,
                url_fetcher=_aucune_ressource_externe).write_pdf()
