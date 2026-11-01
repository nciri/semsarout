"""Les actes arabes doivent sortir lisibles du rendu PDF.

Avant WeasyPrint, ils sortaient en carrés vides et dans l'ordre latin : xhtml2pdf repose sur
ReportLab, qui ne forme pas les ligatures arabes et ignore l'algorithme bidi. Ces tests
vérifient ce qui tombait alors — une police arabe réellement embarquée dans le fichier, et
le sens de lecture choisi sur le contenu, pas supposé.
"""
import re
import zlib

from app.pdf import _sens, render_pdf_bytes

_FLUX = re.compile(rb"stream\r?\n(.*?)\r?\nendstream", re.S)


def _lisible(pdf: bytes) -> bytes:
    """Le PDF plus ses flux décompressés — les noms de police vivent dans un flux d'objets."""
    morceaux = [pdf]
    for flux in _FLUX.findall(pdf):
        try:
            morceaux.append(zlib.decompress(flux))
        except zlib.error:  # flux non compressé (images, polices embarquées)
            pass
    return b"".join(morceaux)

ACTE_AR = ("<h1>وعد متبادل ببيع عقار محفظ</h1>"
           "<p>ثمن البيع محدد في 1 500 000 درهم، يؤدى عند التوقيع.</p>"
           "<table><tr><th>المرحلة</th><th>النسبة</th></tr>"
           "<tr><td>التسبيق</td><td>10%</td></tr></table>")
ACTE_FR = "<h1>Compromis de vente</h1><p>Prix : 1 500 000 MAD, payable à la signature.</p>"


def test_acte_arabe_embarque_une_police_arabe():
    pdf = render_pdf_bytes(ACTE_AR)
    assert pdf.startswith(b"%PDF")
    # Le nom de la police subsettée apparaît en clair dans le PDF. Sans elle, le lecteur
    # n'a aucun glyphe arabe à dessiner : c'est exactement le défaut d'avant.
    assert b"Naskh" in _lisible(pdf), "aucune police arabe embarquee dans le PDF"


def test_sens_de_lecture_suit_la_langue_dominante():
    assert _sens(ACTE_AR) == "rtl"
    assert _sens(ACTE_FR) == "ltr"
    # Un acte français qui cite trois mots d'arabe reste lu de gauche à droite.
    assert _sens(ACTE_FR + "<p>الرسم العقاري</p>") == "ltr"


def test_acte_francais_rendu_sans_regression():
    pdf = render_pdf_bytes(ACTE_FR)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 1000


def test_aucune_ressource_distante_nest_chargee(monkeypatch):
    """Le corps d'un acte ne doit jamais faire sortir le service pour chercher un fichier.

    L'allowlist produit n'admet aucune balise qui référence une ressource, mais le rendu
    est la frontière de confiance : si elle venait à s'élargir, le service deviendrait un
    relais de lecture de fichiers locaux et de requêtes internes (SSRF).
    """
    from app import pdf as module

    vus = []
    garde = module._aucune_ressource_externe

    def _espion(url, **kw):
        vus.append(url)
        return garde(url, **kw)

    _espion._fail_on_errors = garde._fail_on_errors

    monkeypatch.setattr(module, "_aucune_ressource_externe", _espion)
    sortie = module.render_pdf_bytes(
        '<p>x</p><img src="file:///etc/passwd">'
        '<img src="http://169.254.169.254/latest/meta-data/">')
    assert sortie.startswith(b"%PDF")
    # Les deux URL sont bien passees par le garde — donc aucune n'a ete recuperee — et le
    # rendu rend quand meme un acte, au lieu de tomber en 500 sur un corps mal colle.
    assert "file:///etc/passwd" in vus
    assert any("169.254.169.254" in u for u in vus)


def test_corps_vide_ne_leve_pas():
    assert render_pdf_bytes("").startswith(b"%PDF")
    assert render_pdf_bytes(None).startswith(b"%PDF")
