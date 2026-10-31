"""Les pointillés d'un acte deviennent des champs à remplir.

Un acte marocain est un formulaire : 22 à 55 pointillés à des positions fixes (numéro de
titre foncier, CNIE, durée du préavis…). Les laisser remplir dans un éditeur WYSIWYG, c'est
laisser retoucher la prose juridique et la structure du document — Quill détruisait déjà
l'en-tête des tableaux d'échéancier. Les champs sont donc saisis séparément et substitués au
rendu, le corps de l'acte restant intact.

Le rang d'un champ est son ordre d'apparition dans le corps, compté exactement comme le
générateur des modèles le compte : même motif, même ordre. Serveur et navigateur numérotent
donc à l'identique, sans marqueur dans le HTML — l'allowlist produit n'admet aucun
attribut `data-*`.
"""
import pytest

from app.champs import compte_champs, remplir

CORPS = ('<h3>ARTICLE 1</h3>'
         '<p>Titre foncier n° ……………, Conservation foncière de ……………</p>'
         '<p style="text-align:justify;">Prix : <strong>1 500 000</strong> MAD, soit ……… %</p>')


def test_compte_les_pointilles_dans_lordre():
    assert compte_champs(CORPS) == 3


def test_remplit_par_rang_et_laisse_les_autres_en_pointilles():
    rendu = remplir(CORPS, {"1": "TF 45/1234"})
    assert "TF 45/1234" in rendu
    assert rendu.count("……………") == 1          # le 2e reste à remplir
    assert "………" in rendu                     # le 3e aussi
    assert "<strong>1 500 000</strong>" in rendu


def test_une_valeur_est_echappee():
    """La valeur vient d'un formulaire : sans échappement, elle injecterait du HTML dans un
    acte que `sanitize_html` ne repasse pas forcément."""
    rendu = remplir(CORPS, {"1": '<script>alert(1)</script>'})
    assert "<script>" not in rendu
    assert "&lt;script&gt;" in rendu


def test_ne_touche_ni_aux_balises_ni_aux_attributs():
    corps = '<p style="text-align:justify;">a ……… b</p>'
    assert remplir(corps, {"1": "X"}) == '<p style="text-align:justify;">a X b</p>'


def test_un_rang_inconnu_ou_vide_ne_change_rien():
    assert remplir(CORPS, {"9": "ignoré"}) == CORPS
    assert remplir(CORPS, {"1": ""}) == CORPS
    assert remplir(CORPS, {}) == CORPS
    assert remplir("", {"1": "X"}) == ""


def test_les_actes_integres_ont_des_champs():
    """Garde-fou de bout en bout : si un acte ne portait aucun pointillé, la saisie n'aurait
    plus rien à offrir et le défaut passerait inaperçu."""
    import re
    from pathlib import Path
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrate_modeles_marocains.sql").read_text()
    corps = re.findall(r"\$html\$\n(.*?)\n\$html\$", sql, re.DOTALL)
    assert len(corps) == 10
    for html in corps:
        assert compte_champs(html) >= 20


# ---- API ----
from fastapi.testclient import TestClient            # noqa: E402
from sqlalchemy import BigInteger, create_engine     # noqa: E402
from sqlalchemy.ext.compiler import compiles         # noqa: E402
from sqlalchemy.orm import sessionmaker              # noqa: E402

from semsar_auth import Principal, get_principal     # noqa: E402

from app import main as m                            # noqa: E402
from app.db import Base, get_db                      # noqa: E402
from app.main import app                             # noqa: E402
from app.models import AgencyRO, Contract, ContractTemplate  # noqa: E402

AGENCE = 4


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    return "INTEGER"


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'contract.db'}", future=True,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    s.add(AgencyRO(id=AGENCE, name="Agence Atlas"))
    s.commit()
    yield s
    s.close()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="7", agency_id=AGENCE, features=["contracts", "contract_templates"])
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _contrat(db, *, integre=True):
    tpl = ContractTemplate(agency_id=None if integre else AGENCE, document_type="lease",
                           name=f"Modele {integre}", lang="fr", body_html=CORPS,
                           is_builtin=integre)
    db.add(tpl)
    db.flush()
    c = Contract(agency_id=AGENCE, title="Bail", document_type="lease", template_id=tpl.id,
                 body_html=CORPS, status="draft")
    db.add(c)
    db.commit()
    return c


def test_les_champs_saisis_sont_stockes_et_relus(client, db_session):
    c = _contrat(db_session)
    r = client.put(f"/backoffice/contracts/{c.id}", json={"filled_fields": {"1": "TF 45/1234"}})
    assert r.status_code == 200, r.text
    assert r.json()["contract"]["filled_fields"] == {"1": "TF 45/1234"}

    lu = client.get(f"/backoffice/contracts/{c.id}").json()["contract"]
    assert lu["filled_fields"] == {"1": "TF 45/1234"}
    assert lu["fields_count"] == 3            # le corps en porte trois
    assert lu["from_builtin"] is True
    # Le corps n'est PAS réécrit : la substitution se fait au rendu.
    assert lu["body_html"] == CORPS


def test_la_prose_dun_acte_integre_nest_pas_editable(client, db_session):
    """Lecture seule : retoucher le corps d'un acte dans un éditeur détruisait la structure
    (l'en-tête des tableaux d'échéancier). Seuls les champs se remplissent."""
    c = _contrat(db_session, integre=True)
    r = client.put(f"/backoffice/contracts/{c.id}", json={"body_html": "<p>réécrit</p>"})
    assert r.status_code == 409
    assert "champs" in r.json()["error"].lower()
    db_session.refresh(c)
    assert c.body_html == CORPS


def test_un_contrat_issu_dun_modele_dagence_reste_editable(client, db_session):
    c = _contrat(db_session, integre=False)
    r = client.put(f"/backoffice/contracts/{c.id}", json={"body_html": "<p>réécrit</p>"})
    assert r.status_code == 200
    assert "réécrit" in r.json()["contract"]["body_html"]


def test_une_saisie_hors_format_est_refusee(client, db_session):
    c = _contrat(db_session)
    for mauvais in ({"1": {"x": 1}}, [1, 2], {"1": "x" * 2001}):
        r = client.put(f"/backoffice/contracts/{c.id}", json={"filled_fields": mauvais})
        assert r.status_code == 400, mauvais


def test_la_finalisation_fige_les_champs_dans_le_corps(client, db_session, monkeypatch):
    """Le PDF archivé a valeur probante : il doit porter les valeurs, et le corps stocké
    doit dire la même chose que lui."""
    vus = {}
    monkeypatch.setattr(m, "render_pdf_bytes", lambda html: vus.setdefault("html", html) and b"" or b"%PDF")
    monkeypatch.setattr(m, "pdf_storage",
                        lambda: type("S", (), {"put": lambda *a, **k: None})())
    c = _contrat(db_session)
    client.put(f"/backoffice/contracts/{c.id}", json={"filled_fields": {"1": "TF 45/1234"}})
    r = client.post(f"/backoffice/contracts/{c.id}/finalize")
    assert r.status_code == 200, r.text
    db_session.refresh(c)
    assert "TF 45/1234" in c.body_html
    assert "TF 45/1234" in vus["html"]
