"""Sanitisation du HTML WYSIWYG : contrat de sécurité de la liste blanche partagée.

Les mêmes charges hostiles sont passées au nettoyage côté navigateur
(`frontend/src/utils/richText.test.js`). Les deux couches sont indépendantes — DOMPurify là,
bleach/html5lib ici — et doivent converger : un contenu assaini par l'une ne doit être ni
dangereux, ni déformé par l'autre.

**Ce module est le producteur de la table de convergence.** Il écrit les charges *et* la
sortie serveur dans `frontend/src/utils/serverSanitize.fixture.json`, que le test front lit.
Une copie transcrite à la main dans le test front n'aurait pas pu détecter la divergence
qu'elle est censée surveiller : un changement de liste blanche ici l'aurait laissée périmée et
le test front serait resté vert. Avec le fixture, le test Python casse (fixture périmé) et,
une fois régénéré, c'est le test front qui casse si le client ne suit pas.

Régénérer : `UPDATE_SANITIZE_FIXTURE=1 python -m pytest tests/test_html_sanitize.py`
"""
import json
import os
import re
from pathlib import Path

import pytest

from app.sanitize import sanitize_html  # import historique du service, re-export de la lib
from semsar_common import html_to_text, sanitize_rich_field

FIXTURE = (Path(__file__).resolve().parents[3]
           / "frontend" / "src" / "utils" / "serverSanitize.fixture.json")

# Table de charges partagée. Toute entrée ajoutée ici arrive automatiquement dans le test
# front via le fixture ; inutile de la recopier là-bas.
HOSTILE = {
    # — Exécution directe et vecteurs mXSS —
    "imgOnerror": "<img src=x onerror=alert(1)>",
    "svgScript": "<svg><script>alert(1)</script></svg>",
    "noscriptMutation": '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    "mathMutation": "<math><mtext><table><mglyph><style><!--</style>"
                    "<img src=x onerror=alert(1)>",
    "eventHandler": '<p id="x" onclick="alert(1)">ok</p>',
    # `<iframe>` **nu**, pas imbriqué dans un `svg`/`math` : c'est la forme qu'un collage
    # depuis une page web apporte réellement, et le balayage de l'étape 2 l'a rencontrée sur
    # quatre champs. Les deux couches doivent en retirer le sous-arbre entier, y compris le
    # contenu de repli qu'un `<iframe>` peut porter.
    "bareIframe": '<p>avant</p><iframe src="https://evil.test">repli</iframe><p>après</p>',
    # — Protocoles —
    "javascriptHref": '<a href="javascript:alert(1)">x</a>',
    "relativeHref": '<a href="/biens/3" title="t">x</a>',
    # — `style` : propriétés et portée par balise —
    "freeStyle": '<p style="position:fixed;top:0">x</p>',
    "cssUrl": '<p style="text-align:center;background:url(http://evil)">x</p>',
    "allowedStyle": '<p style="text-align:center">x</p>',
    # `"*": ["style"]` côté serveur : `style` vaut sur **toute** balise autorisée, pas
    # seulement les blocs. Le client doit refléter ce `"*"`.
    "styleOnListItem": '<ul><li style="text-align:center">x</li></ul>',
    "styleOnBlockquote": '<blockquote style="text-align:right">x</blockquote>',
    # — Attributs autorisés, mais sur la mauvaise balise —
    "hrefOnParagraph": '<p href="https://evil.test">x</p>',
    "colspanOnParagraph": '<p colspan="2">x</p>',
    # — Ordre des attributs : bleach conserve l'ordre de la source, DOMPurify doit trier
    #   pour que sa sortie soit déterministe (cf. `richText.js`). Divergence cosmétique, mais
    #   déclarée plutôt que tue : une valeur stockée peut porter un autre ordre que l'éditeur.
    "attrOrder": '<table><tr><td rowspan="2" style="text-align:center" colspan="3">x</td>'
                 '</tr></table>',
    # — Balises inconnues : dépliées, leur texte reste —
    "unknownTags": '<div class="x"><font face="y">texte</font></div>',
    # — Donnée d'avant la bascule WYSIWYG : du texte brut, déjà un point fixe —
    "plainTextLineBreaks": "Visite rapide.\nCuisine à refaire.",
}

# Contrat de sécurité : aucune des deux couches ne doit laisser passer ceci.
UNSAFE = [r"<\s*script", r"<\s*img", r"<\s*svg", r"<\s*math", r"<\s*iframe",
          r"<\s*noscript", r"\son\w+\s*=", r"javascript:", r"position\s*:", r"url\s*\("]


def _expected_fixture() -> dict:
    return {
        "_comment": "Produit par services/contract/tests/test_html_sanitize.py. "
                    "Ne pas éditer à la main : "
                    "UPDATE_SANITIZE_FIXTURE=1 python -m pytest tests/test_html_sanitize.py",
        "payloads": HOSTILE,
        "serverOutput": {name: sanitize_html(payload) for name, payload in HOSTILE.items()},
        "unsafePatterns": UNSAFE,
    }


def test_front_end_fixture_is_up_to_date():
    """Le fixture lu par le test front doit refléter cette liste blanche, à la lettre."""
    expected = _expected_fixture()
    if os.environ.get("UPDATE_SANITIZE_FIXTURE"):
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    assert FIXTURE.exists(), f"fixture absent : {FIXTURE}"
    assert json.loads(FIXTURE.read_text(encoding="utf-8")) == expected, (
        "La liste blanche serveur a changé : régénérer le fixture avec "
        "UPDATE_SANITIZE_FIXTURE=1 python -m pytest tests/test_html_sanitize.py, "
        "puis vérifier que frontend/src/utils/richText.test.js passe toujours."
    )


@pytest.mark.parametrize("name", sorted(HOSTILE))
def test_hostile_payloads_are_neutralised(name):
    clean = sanitize_html(HOSTILE[name])
    for motif in UNSAFE:
        assert not re.search(motif, clean, re.IGNORECASE), f"{name} : {clean!r}"
    assert "alert(1)" not in clean


def test_server_output_is_pinned_payload_by_payload():
    assert sanitize_html(HOSTILE["imgOnerror"]) == ""
    # Les sous-arbres qui changent d'espace de noms partent entiers (vecteur mXSS).
    assert sanitize_html(HOSTILE["svgScript"]) == ""
    assert sanitize_html(HOSTILE["javascriptHref"]) == "<a>x</a>"
    assert sanitize_html(HOSTILE["relativeHref"]) == '<a href="/biens/3" title="t">x</a>'
    assert sanitize_html(HOSTILE["allowedStyle"]) == '<p style="text-align:center;">x</p>'
    assert sanitize_html(HOSTILE["cssUrl"]) == '<p style="text-align:center;">x</p>'
    # `style` vaut sur toute balise autorisée, pas seulement les blocs.
    assert sanitize_html(HOSTILE["styleOnListItem"]) == \
        '<ul><li style="text-align:center;">x</li></ul>'
    # Un attribut autorisé ailleurs ne l'est pas ici.
    assert sanitize_html(HOSTILE["hrefOnParagraph"]) == "<p>x</p>"
    assert sanitize_html(HOSTILE["colspanOnParagraph"]) == "<p>x</p>"
    # Résidus inertes propres à html5lib : du texte, jamais du balisage exécutable.
    assert sanitize_html(HOSTILE["noscriptMutation"]) == '"&gt;'
    assert sanitize_html(HOSTILE["mathMutation"]) == "<table></table>"
    assert sanitize_html(HOSTILE["freeStyle"]) == '<p style="">x</p>'
    # Un texte brut d'avant la bascule traverse intact, sauts de ligne compris : c'est à
    # l'affichage de les remonter en paragraphes (`ensureRichText`), pas à la sanitisation.
    assert sanitize_html(HOSTILE["plainTextLineBreaks"]) == HOSTILE["plainTextLineBreaks"]


def test_sanitisation_is_idempotent():
    for payload in HOSTILE.values():
        once = sanitize_html(payload)
        assert sanitize_html(once) == once


def test_rich_field_normalises_an_emptied_editor():
    assert sanitize_rich_field("<p><br></p>") is None
    assert sanitize_rich_field("") is None
    assert sanitize_rich_field("<p>contenu</p>") == "<p>contenu</p>"


def test_html_to_text_feeds_the_surfaces_that_cannot_render_html():
    assert html_to_text("<p>Un</p><ul><li>a</li><li>b</li></ul>") == "Un\na\nb"
    assert html_to_text("<p>a &amp; b</p>") == "a & b"
    assert html_to_text("<script>alert(1)</script><p>ok</p>") == "ok"
