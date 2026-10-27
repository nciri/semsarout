"""Recherche détaillée du portefeuille (étape « choisir le bien » d'une transaction)."""
import app.main as m
from app.models import Property
from semsar_auth import Principal, get_principal

AGENCY = 3


def _as_agent():
    m.app.dependency_overrides[get_principal] = lambda: Principal(
        sub="7", roles=["agent"], agency_id=AGENCY, is_superadmin=False, features=[], claims={})


def _bien(db, ref, **kw):
    defaults = dict(reference=ref, title=f"Bien {ref}", property_type="apartment",
                    transaction_type="sale", price=1_000_000, surface=80, bedrooms=2,
                    city="Casablanca", neighborhood="Anfa", status="active", agency_id=AGENCY)
    db.add(Property(**{**defaults, **kw}))
    db.commit()


def _refs(client, query):
    resp = client.get(f"/backoffice/properties?{query}")
    assert resp.status_code == 200
    return sorted(p["reference"] for p in resp.json()["properties"])


def test_filtres_surface_chambres_et_quartier(client, db_session):
    _as_agent()
    _bien(db_session, "P-1", surface=60, bedrooms=1, neighborhood="Maarif")
    _bien(db_session, "P-2", surface=120, bedrooms=3, neighborhood="Anfa Supérieur")
    _bien(db_session, "P-3", surface=200, bedrooms=4, neighborhood="Californie")

    assert _refs(client, "min_surface=100") == ["P-2", "P-3"]
    assert _refs(client, "min_surface=100&max_surface=150") == ["P-2"]
    assert _refs(client, "min_bedrooms=3") == ["P-2", "P-3"]
    assert _refs(client, "neighborhood=anfa") == ["P-2"]
    m.app.dependency_overrides.pop(get_principal, None)


def test_la_recherche_reste_cloisonnee_a_lagence(client, db_session):
    """Un filtre large ne doit jamais faire sortir le bien d'une autre agence."""
    _as_agent()
    _bien(db_session, "P-1", surface=120)
    _bien(db_session, "VOISIN", surface=120, agency_id=AGENCY + 1)

    assert _refs(client, "min_surface=10&min_bedrooms=1") == ["P-1"]
    m.app.dependency_overrides.pop(get_principal, None)


def test_tri_par_colonne(client, db_session):
    _as_agent()
    _bien(db_session, "P-1", price=2_000_000, surface=60)
    _bien(db_session, "P-2", price=500_000, surface=200)

    def refs(query):
        return [p["reference"] for p in client.get(f"/backoffice/properties?{query}").json()["properties"]]

    assert refs("sort_by=price&sort_order=asc") == ["P-2", "P-1"]
    assert refs("sort_by=surface&sort_order=desc") == ["P-2", "P-1"]
    # Un nom de colonne inconnu ne doit pas casser la page : on retombe sur l'ordre par défaut.
    assert sorted(refs("sort_by=metadata")) == ["P-1", "P-2"]
    m.app.dependency_overrides.pop(get_principal, None)
