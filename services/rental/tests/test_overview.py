"""Synthèse de la gestion locative et enrichissement des listes (back-office agence)."""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from semsar_auth import Principal, get_principal

from app import main, overview
from app.db import get_db
from app.main import app
from app.models import (ApplicationDocument, ClientRO, Inventory, Lease, Mandate, PropertyRO,
                        RentPeriod, TenantApplication)

AGENCY = 5
NOW = datetime(2026, 7, 27, 10, 0)
CRM = {200: {"name": "Amine Tazi", "email": "amine.tazi@gmail.com", "phone": "+212661234518"}}


def lookup(cid):
    return CRM.get(cid, {})


def _rp(lease, y, m, day, total, status="pending", paid=None, paid_at=None, agency=AGENCY):
    return RentPeriod(lease_id=lease.id, agency_id=agency, year=y, month=m, period_label=f"{m}/{y}",
                      rent_amount=total, charges_amount=0, total_amount=total,
                      due_date=datetime(y, m, day), status=status, paid_amount=paid, paid_at=paid_at)


@pytest.fixture
def portfolio(db_session):
    db = db_session
    db.add_all([PropertyRO(id=1, title="Appartement Gauthier", city="Casablanca"),
                PropertyRO(id=2, title="Vue mer Malabata", city="Tanger"),
                PropertyRO(id=3, title="Villa Hay Riad", city="Rabat"),
                ClientRO(id=100, first_name="Hamid", last_name="Berrada"),
                ClientRO(id=201, first_name="Karim", last_name="Lahlou", email="k.lahlou@outlook.fr")])
    a = Mandate(reference="MND-A", agency_id=AGENCY, property_id=1, landlord_client_id=100,
                fee_percent=8, status="active")
    b = Mandate(reference="MND-B", agency_id=AGENCY, property_id=2, landlord_client_id=100,
                fee_percent=6, status="active", end_date=datetime(2026, 8, 15),
                signed_at=datetime(2026, 6, 1))
    c = Mandate(reference="MND-C", agency_id=AGENCY, property_id=2, landlord_client_id=100, status="draft")
    d = Mandate(reference="MND-D", agency_id=AGENCY, property_id=3, landlord_client_id=100,
                fee_percent=10, status="active")
    foreign = Mandate(reference="MND-X", agency_id=AGENCY + 1, property_id=9, landlord_client_id=1,
                      status="active")
    db.add_all([a, b, c, d, foreign])
    db.flush()
    l1 = Lease(reference="BAIL-1", agency_id=AGENCY, mandate_id=a.id, property_id=1, tenant_client_id=200,
               rent_amount=6500, charges_amount=500, deposit_amount=13000, status="active",
               start_date=datetime(2025, 8, 1), end_date=datetime(2026, 7, 31))
    l2 = Lease(reference="BAIL-2", agency_id=AGENCY, mandate_id=d.id, property_id=3, tenant_client_id=201,
               rent_amount=5000, deposit_amount=10000, status="active", start_date=datetime(2025, 1, 1))
    lx = Lease(reference="BAIL-X", agency_id=AGENCY + 1, mandate_id=foreign.id, property_id=9,
               tenant_client_id=1, rent_amount=9999, status="active")
    db.add_all([l1, l2, lx])
    db.flush()
    db.add_all([
        _rp(l1, 2026, 6, 5, 7000, "paid", 7000, datetime(2026, 6, 5)),
        _rp(l1, 2026, 7, 5, 7000, "partial", 3000, datetime(2026, 7, 12)),
        _rp(l1, 2026, 8, 5, 7000),
        _rp(l2, 2026, 5, 1, 5000, "late"),
        _rp(l2, 2026, 7, 1, 5000, "paid", 5000, datetime(2026, 7, 20)),
        _rp(lx, 2026, 5, 1, 9999, "late", agency=AGENCY + 1),
        Inventory(lease_id=l2.id, agency_id=AGENCY, type="entree", status="signed"),
    ])
    app1 = TenantApplication(property_id=2, agency_id=AGENCY, applicant_name="Khadija Fassi",
                             applicant_email="khadija@gmail.com", status="received",
                             submitted_at=datetime(2026, 7, 20))
    app2 = TenantApplication(property_id=2, agency_id=AGENCY, applicant_name="Ahmed", status="accepted",
                             submitted_at=datetime(2026, 6, 20), decided_at=datetime(2026, 7, 10))
    app3 = TenantApplication(property_id=9, agency_id=AGENCY + 1, applicant_name="Autre", status="received",
                             submitted_at=datetime(2026, 7, 1))
    db.add_all([app1, app2, app3])
    db.flush()
    db.add_all([ApplicationDocument(application_id=app1.id, doc_type="cin"),
                ApplicationDocument(application_id=app1.id, doc_type="bulletin_salaire")])
    db.commit()
    return {"a": a, "b": b, "l1": l1, "l2": l2, "app1": app1}


def test_period_state():
    rp = RentPeriod(status="paid", due_date=datetime(2026, 7, 1), paid_at=datetime(2026, 7, 6))
    assert overview.period_state(rp, NOW) == "paid"
    rp.paid_at = datetime(2026, 7, 7)
    assert overview.period_state(rp, NOW) == "paid_late"
    assert overview.period_state(RentPeriod(status="pending", due_date=datetime(2026, 8, 5)), NOW) == "upcoming"
    # Échue mais jamais relancée : le statut stocké est encore `pending`, elle est pourtant en retard.
    assert overview.period_state(RentPeriod(status="pending", due_date=datetime(2026, 7, 26)), NOW) == "late"
    assert overview.period_state(RentPeriod(status="pending", due_date=datetime(2026, 7, 27)), NOW) == "upcoming"
    assert [overview.age_bucket(d) for d in (14, 15, 45, 46)] == ["lt15", "d15_45", "d15_45", "gt45"]


def test_summary(db_session, portfolio):
    s = overview.summary(db_session, AGENCY, NOW, 90, lookup)

    assert s["month"] == {"expected": 12000, "collected": 8000, "count": 2}
    assert s["fees"]["month"] == pytest.approx(3000 * 0.08 + 5000 * 0.10)
    assert s["occupancy"] == {"managed": 3, "leased": 2}

    ar = s["arrears"]
    assert (ar["total"], ar["periods"], ar["leases"]) == (9000, 2, 2)
    assert ar["buckets"] == {"lt15": 0, "d15_45": 4000, "gt45": 5000}
    assert [(i["lease_reference"], i["rest"], i["age_days"]) for i in ar["items"]] == [
        ("BAIL-2", 5000, 87), ("BAIL-1", 4000, 22)]
    assert ar["items"][1]["tenant_name"] == "Amine Tazi"

    ex = s["expiring"]
    assert [(i["kind"], i["reference"], i["days_left"]) for i in ex["items"]] == [
        ("lease", "BAIL-1", 4), ("mandate", "MND-B", 19)]
    assert ex["undated"] == {"leases": 1, "mandates": 2}

    inv = s["inventories"]
    assert [(i["reference"], i["type"], i["status"]) for i in inv["items"]] == [
        ("BAIL-1", "entree", "missing"), ("BAIL-1", "sortie", "to_plan")]
    assert (inv["active_leases"], inv["entry_signed"], inv["deposits_exposed"]) == (2, 1, 13000)

    assert [(v["reference"], v["days"], v["candidates"]) for v in s["vacant"]] == [("MND-B", 56, 1)]

    apps = s["applications"]
    assert [(a["applicant_name"], a["age_days"], a["documents_count"]) for a in apps["pending"]] == [
        ("Khadija Fassi", 7, 2)]
    assert [a["applicant_name"] for a in apps["recent_decisions"]] == ["Ahmed"]

    months = {m["key"]: m for m in s["collections"]["months"]}
    assert list(months) == ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]
    assert (months["2026-07"]["expected"], months["2026-07"]["collected"]) == (12000, 8000)
    assert (months["2026-05"]["expected"], months["2026-05"]["collected"]) == (5000, 0)


def test_expiring_horizon(db_session, portfolio):
    assert [i["reference"] for i in overview.expiring(db_session, AGENCY, NOW, 7, lookup)["items"]] == ["BAIL-1"]


def test_enrich_leases_and_mandates(db_session, portfolio):
    l1, l2 = portfolio["l1"], portfolio["l2"]
    rows = overview.enrich_leases(db_session, AGENCY, [main._lease_dict(l1), main._lease_dict(l2)], NOW, lookup)
    r1, r2 = rows
    assert (r1["property_title"], r1["property_city"]) == ("Appartement Gauthier", "Casablanca")
    assert (r1["tenant_name"], r1["tenant_phone"]) == ("Amine Tazi", "+212661234518")
    assert (r1["mandate_reference"], r1["landlord_name"], r1["fee_percent"]) == ("MND-A", "Hamid Berrada", 8)
    assert [p["state"] for p in r1["periods"]] == ["paid", "partial", "upcoming"]
    assert (r1["owed"], r1["open_periods"], r1["days_to_end"]) == (4000, 1, 4)
    assert r1["inventories"] == {"entree": None, "sortie": None}
    assert r2["tenant_name"] == "Karim Lahlou"
    assert [p["state"] for p in r2["periods"]] == ["late", "paid_late"]
    assert r2["inventories"]["entree"]["status"] == "signed"

    m = overview.enrich_mandates(db_session, AGENCY, [main._mandate_dict(portfolio["a"]),
                                                      main._mandate_dict(portfolio["b"])], NOW, lookup)
    assert (m[0]["active_lease_id"], m[0]["landlord_name"]) == (l1.id, "Hamid Berrada")
    assert (m[1]["active_lease_id"], m[1]["days_to_end"], m[1]["property_title"]) == (None, 19, "Vue mer Malabata")


@pytest.fixture
def agency_client(db_session, monkeypatch):
    monkeypatch.setattr(main, "_client_lookup", lookup)
    agent = Principal(sub="3", roles=["agent"], agency_id=AGENCY, is_superadmin=False,
                      features=["rental"], claims={})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: agent
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_routes_are_scoped_to_the_agency(agency_client, portfolio):
    s = agency_client.get("/backoffice/gestion-locative/summary").json()
    assert s["counts"] == {"mandates": 4, "leases": 2, "active_leases": 2}
    assert all(i["lease_reference"] != "BAIL-X" for i in s["arrears"]["items"])
    assert s["expiring"]["days"] == 90
    assert agency_client.get("/backoffice/gestion-locative/expiring?days=400").json()["days"] == 365

    leases = agency_client.get("/backoffice/gestion-locative/leases").json()["leases"]
    assert {l["reference"] for l in leases} == {"BAIL-1", "BAIL-2"}
    assert all("periods" in l and "tenant_name" in l for l in leases)
    one = agency_client.get(f"/backoffice/gestion-locative/leases/{portfolio['l1'].id}").json()
    assert one["tenant_name"] == "Amine Tazi" and one["rent_amount"] == 6500

    apps = agency_client.get("/backoffice/gestion-locative/applications").json()["applications"]
    assert {(a["applicant_name"], a["documents_count"], a["property_city"]) for a in apps} == {
        ("Khadija Fassi", 2, "Tanger"), ("Ahmed", 0, "Tanger")}
    mandates = agency_client.get("/backoffice/gestion-locative/mandates").json()["mandates"]
    assert {m["reference"] for m in mandates} == {"MND-A", "MND-B", "MND-C", "MND-D"}


def test_summary_is_gated(db_session):
    agent = Principal(sub="3", roles=["agent"], agency_id=AGENCY, is_superadmin=False, features=[], claims={})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: agent
    with TestClient(app) as c:
        assert c.get("/backoffice/gestion-locative/summary").status_code == 403
    app.dependency_overrides.clear()
