"""Le tableau de bord doit se ranger par activité : vente et location n'ont ni les mêmes
dossiers ni les mêmes chiffres, et une agence de gestion ne doit pas lire une page vide.
"""
from datetime import datetime, timedelta

from app.dashboard import main


def _prop(pid, ttype, status="active", updated_days=0):
    return {"id": pid, "status": status, "transaction_type": ttype, "title": f"B{pid}",
            "city": "Casablanca", "price": 1000, "views_count": 10, "contacts_count": 1,
            "updated_at": (datetime.utcnow() - timedelta(days=updated_days)).isoformat()}


def _lead(pid, days_ago=1):
    return {"id": pid, "name": f"L{pid}", "source": "website", "status": "new",
            "created_at": (datetime.utcnow() - timedelta(days=days_ago)).isoformat(),
            "property_id": pid, "property_title": f"B{pid}", "converted_at": None}


def _visit(pid, days, status="completed"):
    return {"id": pid, "status": status, "property_id": pid,
            "scheduled_at": (datetime.utcnow() + timedelta(days=days)).isoformat()}


PROPS = [_prop(1, "sale"), _prop(2, "rent")]


def test_les_leads_portent_lactivite_du_bien():
    out = main(PROPS, [_lead(1), _lead(2)], [], [], [])
    assert {l["id"]: l["transaction_type"] for l in out["widgets"]["new_leads"]} == {1: "sale", 2: "rent"}


def test_les_visites_a_venir_portent_lactivite_du_bien():
    out = main(PROPS, [], [], [_visit(1, 2, "scheduled"), _visit(2, 3, "scheduled")], [])
    assert {v["id"]: v["transaction_type"] for v in out["widgets"]["upcoming_visits"]} == {1: "sale", 2: "rent"}


def test_les_issues_de_visite_sont_aussi_donnees_par_activite():
    """Le filtre du tableau de bord ne doit rien avoir à recalculer côté navigateur."""
    visits = [_visit(1, -2), _visit(2, -3), _visit(2, -4, "no_show")]
    out = main(PROPS, [], [], visits, [])["widgets"]["recent_visit_outcomes"]
    assert out["total"] == 3 and out["completed"] == 2 and out["no_show"] == 1
    assert out["sale"]["total"] == 1 and out["sale"]["completed"] == 1
    assert out["rent"]["total"] == 2 and out["rent"]["no_show"] == 1


def test_le_portefeuille_est_aussi_compte_par_activite():
    props = [_prop(1, "sale"), _prop(2, "rent"), _prop(3, "rent", status="draft")]
    listings = main(props, [], [], [], [])["widgets"]["listings"]
    assert listings["by_status"] == {"active": 2, "draft": 1}
    assert listings["by_status_by_type"] == {"sale": {"active": 1}, "rent": {"active": 1, "draft": 1}}


def test_un_bien_loue_compte_dans_les_affaires_conclues_du_mois():
    """Sans cela, une agence de gestion afficherait zéro tout le mois."""
    props = [_prop(1, "sale", status="sold"), _prop(2, "rent", status="rented")]
    out = main(props, [], [], [], [])["properties"]
    assert out["sold_this_month"] == 2
    assert out["rented_this_month"] == 1
