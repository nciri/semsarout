"""Le mini-langage des `Paragraph` ReportLab, et les deux façons dont il nous trahit.

Mesuré sur la version installée (reportlab 5.1.0), un `Paragraph` :

- **lève** un `ValueError` sur une balise reconnue mais non fermée (`…<b>`), donc un nom de
  locataire ou un commentaire d'état des lieux finissant par un chevron transformait
  « télécharger la quittance » en 500 — c'était déjà vrai **avant** la bascule WYSIWYG ;
- **supprime silencieusement** une balise inconnue de son mini-langage (`<p>`, `<ul>`,
  `<strong>`). Contrairement à ce que supposait l'inventaire de l'étape 1, un `<p>` ne lève
  donc pas : il efface la structure sans le dire. Des observations générales en HTML
  arriveraient en une seule ligne continue, et le test de projection ci-dessous est ce qui
  tient cette moitié-là.

Ces cas appellent les fonctions de rendu directement : ce qu'ils défendent est que l'octet
sorte, et qu'il porte le texte, pas qu'une route réponde.
"""
from datetime import date, datetime
from io import BytesIO
from types import SimpleNamespace

import pytest

from app import pdf

HOSTILE = "Ben <Ali> & Fils <b>"
RICHE = ('<p>Portail <strong>bloqué</strong></p><ul><li>Volet <em>cassé</em></li>'
         '<li>Peinture à refaire</li></ul>')


def _pdf_valide(octets):
    assert isinstance(octets, bytes)
    assert octets.startswith(b"%PDF")
    return octets


def test_la_quittance_survit_a_des_noms_contenant_du_balisage():
    rp = SimpleNamespace(receipt_number="Q-<2026>/01", period_label="Janvier & Février",
                         rent_amount=5000, charges_amount=300, total_amount=5300,
                         paid_at=datetime(2026, 1, 5))
    _pdf_valide(pdf.render_receipt_pdf(rp, tenant_name=HOSTILE, landlord_name=HOSTILE,
                                       property_title="T3 <Gauthier> & co"))


def test_le_bail_et_le_mandat_survivent_aux_memes_valeurs():
    lease = SimpleNamespace(reference="B-<1>", rent_amount=5000, charges_amount=300,
                            deposit_amount=10000, payment_day=5,
                            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
    _pdf_valide(pdf.render_lease_pdf(lease, None, HOSTILE, HOSTILE, "T3 <Gauthier>"))

    mandate = SimpleNamespace(mandate_type="gestion & location", reference="M-<1>",
                              fee_percent=8, start_date=date(2026, 1, 1),
                              end_date=date(2026, 12, 31))
    _pdf_valide(pdf.render_mandate_pdf(mandate, HOSTILE, "T3 <Gauthier>"))


def test_l_etat_des_lieux_rend_des_observations_en_texte_riche_sans_lever():
    """Le risque nommé par l'étape 1 : `general_notes` est passé en WYSIWYG. Le `<b>` non
    fermé de `HOSTILE` est ce qui lève réellement ; le `<ul>` des observations, lui, serait
    silencieusement supprimé — d'où la projection, vérifiée par le dernier cas."""
    inv = SimpleNamespace(type="entree", conducted_at=datetime(2026, 1, 5),
                          general_notes=RICHE)
    rooms = [{"name": "Salon & <salle>", "items": [
        {"label": "Volet <roulant>", "condition": "mauvais",
         "comment": "Lame cassée & bloquée"},
        {"label": "Mur", "condition": "bon", "comment": None},
    ]}]

    _pdf_valide(pdf.render_inventory_pdf(inv, rooms, "T3 <Gauthier>", HOSTILE))


def test_l_etat_des_lieux_survit_aussi_a_un_commentaire_contenant_un_chevron_seul():
    """Le même défaut, sur le champ voisin : `comment` est un `<input>` texte, jamais
    assaini. Celui-ci passe aujourd'hui, et c'est précisément pourquoi l'échappement doit
    être systématique plutôt que réservé aux cas qu'on sait reproduire."""
    inv = SimpleNamespace(type="sortie", conducted_at=None, general_notes=None)
    rooms = [{"name": "Cuisine", "items": [
        {"label": "Plan de travail", "condition": "moyen", "comment": "largeur < 60 cm"},
    ]}]

    _pdf_valide(pdf.render_inventory_pdf(inv, rooms, None, None))


def test_le_decompte_et_le_crg_survivent_a_un_libelle_de_retenue_balise():
    s = SimpleNamespace(deposit_amount=10000)
    lines = [SimpleNamespace(label="Remise en état <salon> & cuisine", amount=1200)]
    _pdf_valide(pdf.render_settlement_pdf(s, lines, HOSTILE, HOSTILE, "T3 <Gauthier>"))

    crg = SimpleNamespace(rent_collected=6000, fees=480, expenses=1200, net=4320,
                          period_label="Septembre & Octobre")
    _pdf_valide(pdf.render_crg_pdf(crg, HOSTILE, "M-<1> & M-2"))


@pytest.mark.parametrize("valeur,attendu", [
    (None, "-"), ("", "-"), ("a < b & c", "a &lt; b &amp; c"), (12, "12"),
])
def test_l_echappement_est_celui_du_mini_langage_de_reportlab(valeur, attendu):
    assert pdf._x(valeur) == attendu


def test_une_balise_non_fermee_leve_sans_l_echappement():
    """Épingle le défaut lui-même : sans `_x`, le rendu lève. Si une version future de
    ReportLab arrête de lever, ce cas le dira plutôt que de laisser croire que les autres
    cas de ce fichier prouvent quelque chose."""
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate

    style = getSampleStyleSheet()["Normal"]
    with pytest.raises(ValueError):
        SimpleDocTemplate(BytesIO()).build([Paragraph(HOSTILE, style)])
    # Échappée, la même valeur passe.
    SimpleDocTemplate(BytesIO()).build([Paragraph(pdf._x(HOSTILE), style)])


def test_la_projection_garde_les_sauts_de_ligne_que_reportlab_sait_rendre():
    from semsar_common import html_to_text

    rendu = pdf._lines(html_to_text(RICHE))
    assert rendu == ("Portail bloqué<br/>Volet cassé<br/>Peinture à refaire")


def _paragraphes(fn, *args, **kwargs) -> list[str]:
    """Textes des `Paragraph` passés à ReportLab.

    Le PDF sorti n'est pas relisible sans extracteur, et en ajouter un comme dépendance de test
    pour vérifier quatre lignes serait payer cher. On intercepte donc la `story`.
    """
    import reportlab.platypus as platypus

    captures: list[list] = []
    origine = platypus.SimpleDocTemplate

    class _Capture(origine):
        def build(self, story, *a, **kw):
            captures.append(list(story))
            return super().build(story, *a, **kw)

    platypus.SimpleDocTemplate = _Capture
    try:
        _pdf_valide(fn(*args, **kwargs))
    finally:
        platypus.SimpleDocTemplate = origine
    return [getattr(f, "text", "") for f in captures[0]]


def test_le_crg_detaille_chaque_depense_date_intitule_artisan_montant():
    """Exigence de la spec. Un net amputé de 1 200 Dh sans ligne explicative est sa plainte
    d'origine, et la date affichée doit être la date RÉELLE de l'intervention — une
    intervention en retard tombe sur le CRG suivant."""
    crg = SimpleNamespace(rent_collected=6000, fees=480, expenses=1500, net=4020,
                          period_label="Septembre 2026")
    lignes = [{"id": 4, "title": "Chauffe-eau", "artisan_name": "Plomberie <Atlas> & Fils",
               "completed_at": "2026-08-28T00:00:00", "cost_final": 1200},
              {"id": 5, "title": "Débouchage", "artisan_name": None,
               "completed_at": None, "cost_final": 300}]
    textes = _paragraphes(pdf.render_crg_pdf, crg, HOSTILE, "MND-7", expense_lines=lignes)

    detail = [x for x in textes if "Chauffe-eau" in x]
    assert len(detail) == 1
    # La date du 28/08 figure en clair sur le CRG de septembre : c'est tout l'intérêt.
    assert "28/08/2026" in detail[0] and "1 200.00" in detail[0]
    assert "Plomberie &lt;Atlas&gt; &amp; Fils" in detail[0]
    assert "<Atlas>" not in detail[0]

    sans_artisan = [x for x in textes if "Débouchage" in x]
    assert len(sans_artisan) == 1 and " - " in sans_artisan[0]

    # Le détail s'insère ENTRE le total des dépenses et le net reversé, pas après.
    positions = [next(i for i, x in enumerate(textes) if marqueur in x)
                 for marqueur in ("Dépenses d'intervention", "Chauffe-eau", "Net reversé")]
    assert positions == sorted(positions)


def test_un_crg_sans_depense_garde_sa_forme():
    crg = SimpleNamespace(rent_collected=6000, fees=480, expenses=0, net=5520,
                          period_label="Septembre 2026")
    textes = _paragraphes(pdf.render_crg_pdf, crg, "Ali Benani", "MND-7")
    assert any("Net reversé" in x for x in textes)
    assert not any("•" in x for x in textes)
