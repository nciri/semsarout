"""Les pointillés d'un acte, vus comme des champs à remplir.

Un acte marocain est un formulaire : 22 à 55 pointillés à des positions fixes — numéro de
titre foncier, CNIE, durée du préavis, date de réitération. Ce que la fusion ne sait pas
résoudre (rien de tout cela n'est stocké) reste un blanc, et ce blanc se remplit à la main.

Le faire dans un éditeur WYSIWYG revient à laisser retoucher la prose juridique et la
structure : l'éditeur du produit détruisait déjà la ligne d'en-tête des tableaux d'échéancier
à chaque enregistrement. Les valeurs sont donc saisies à part, stockées sur le contrat, et
substituées au rendu — le corps de l'acte n'est jamais réécrit.

Le rang d'un champ est son ordre d'apparition dans le corps, compté avec le MÊME motif que
le générateur des modèles (`tools/build_modeles_marocains.py`). Serveur et navigateur
numérotent donc à l'identique, sans marqueur dans le HTML : l'allowlist produit n'admet
aucun attribut `data-*`, et en ajouter un pour cela ouvrirait la porte à tous les autres.
"""
import re
from html import escape

# Au moins deux « … » (U+2026) ou quatre points. Un « … » seul est une vraie ellipse de prose
# (« parking, cave, terrasse… ») et n'est pas un champ.
BLANC = re.compile("…{2,}|[.]{4,}")
# Découpe le HTML en balises et en texte : une substitution faite sans ça toucherait aussi
# les attributs (un `style` ou un `href` contenant des points).
_MORCEAUX = re.compile(r"(<[^>]+>)")


def _parties_texte(body_html: str):
    """Morceaux du corps, en indiquant lesquels sont du texte substituable."""
    for i, morceau in enumerate(_MORCEAUX.split(body_html or "")):
        yield morceau, i % 2 == 0   # les index impairs sont les balises


def compte_champs(body_html: str) -> int:
    """Nombre de champs à remplir dans ce corps."""
    return sum(len(BLANC.findall(m)) for m, est_texte in _parties_texte(body_html) if est_texte)


def remplir(body_html: str, valeurs: dict) -> str:
    """Corps où le n-ième pointillé porte `valeurs[str(n)]`, s'il en existe une.

    Une valeur vide laisse le pointillé : un champ non saisi doit continuer de se lire comme
    un champ à remplir, jamais comme un blanc muet.
    """
    if not body_html:
        return ""
    rang = [0]

    def _un(m):
        rang[0] += 1
        valeur = (valeurs or {}).get(str(rang[0]))
        return escape(str(valeur), quote=False) if valeur else m.group(0)

    return "".join(BLANC.sub(_un, morceau) if est_texte else morceau
                   for morceau, est_texte in _parties_texte(body_html))
