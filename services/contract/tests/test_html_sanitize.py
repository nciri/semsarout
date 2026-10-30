"""Sanitisation du HTML WYSIWYG : contrat de sécurité de la liste blanche partagée.

Les mêmes charges hostiles sont passées au nettoyage côté navigateur dans
`frontend/src/utils/richText.test.js` : les deux couches sont indépendantes (bleach/html5lib
ici, un marcheur DOM là) et doivent converger — un contenu assaini par l'une ne doit être ni
dangereux, ni déformé par l'autre.
"""
import re

import pytest

from app.sanitize import sanitize_html  # import historique du service, re-export de la lib
from semsar_common import html_to_text, sanitize_rich_field

# Charges partagées avec le test front (mêmes clés).
HOSTILE = {
    "imgOnerror": "<img src=x onerror=alert(1)>",
    "svgScript": "<svg><script>alert(1)</script></svg>",
    "noscriptMutation": '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    "javascriptHref": '<a href="javascript:alert(1)">x</a>',
    "mathMutation": "<math><mtext><table><mglyph><style><!--</style>"
                    "<img src=x onerror=alert(1)>",
    "freeStyle": '<p style="position:fixed;top:0">x</p>',
    "cssUrl": '<p style="text-align:center;background:url(http://evil)">x</p>',
    "allowedStyle": '<p style="text-align:center">x</p>',
}

# Ce que le nettoyage côté navigateur rend pour ces mêmes charges.
CLIENT_OUTPUT = {
    "imgOnerror": "",
    "svgScript": "",
    "noscriptMutation": "",
    "javascriptHref": "<a>x</a>",
    "mathMutation": "",
    "freeStyle": "<p>x</p>",
    "cssUrl": '<p style="text-align:center;">x</p>',
    "allowedStyle": '<p style="text-align:center;">x</p>',
}

# Contrat de sécurité : aucune des deux couches ne doit laisser passer ceci.
UNSAFE = [r"<\s*script", r"<\s*img", r"<\s*svg", r"<\s*math", r"<\s*iframe",
          r"<\s*noscript", r"\son\w+\s*=", r"javascript:", r"position\s*:", r"url\s*\("]


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
    assert sanitize_html(HOSTILE["allowedStyle"]) == '<p style="text-align:center;">x</p>'
    assert sanitize_html(HOSTILE["cssUrl"]) == '<p style="text-align:center;">x</p>'
    # Résidus inertes propres à html5lib : du texte, jamais du balisage exécutable.
    assert sanitize_html(HOSTILE["noscriptMutation"]) == '"&gt;'
    assert sanitize_html(HOSTILE["mathMutation"]) == "<table></table>"
    assert sanitize_html(HOSTILE["freeStyle"]) == '<p style="">x</p>'


@pytest.mark.parametrize("name", sorted(CLIENT_OUTPUT))
def test_client_output_passes_unchanged_and_safe(name):
    """Convergence : ce que le navigateur a assaini doit traverser cette couche inchangé,
    sinon un champ saisi d'un côté perdrait sa mise en forme à l'enregistrement."""
    client = CLIENT_OUTPUT[name]
    assert sanitize_html(client) == client
    for motif in UNSAFE:
        assert not re.search(motif, client, re.IGNORECASE), f"{name} : {client!r}"


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
