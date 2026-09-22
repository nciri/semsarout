"""Registre back-office : filtre de période, commission attendue et synthèse vente/location."""
from datetime import datetime

from app.models import Transaction

_n = 0


def _tx(db, **kw):
    global _n
    _n += 1
    base = dict(reference=f"TX-{_n}", property_id=1, client_id=1, agent_id=7, agency_id=1,
                transaction_type="sale", stage="offer", status="active", probability=50)
    t = Transaction(**{**base, **kw})
    db.add(t)
    db.commit()
    return t


def test_list_exposes_stage_dates_and_expected_commission(client, db_session):
    _tx(db_session, asking_price=1_000_000, offer_price=900_000, commission_rate=3,
        visit_date=datetime(2026, 7, 1))
    tx = client.get("/backoffice/transactions").json()["transactions"][0]
    assert tx["visit_date"].startswith("2026-07-01")
    assert tx["closed_at"] is None
    # Taux appliqué au meilleur prix connu (l'offre), comme pour les commissions déjà calculées.
    assert tx["expected_commission"] == 27_000


def test_saved_commission_amount_wins_over_rate(client, db_session):
    _tx(db_session, status="won", final_price=783_661.19, commission_rate=3.5,
        commission_amount=27_428.14, closed_at=datetime(2026, 6, 26))
    tx = client.get("/backoffice/transactions").json()["transactions"][0]
    assert tx["expected_commission"] == 27_428.14


def test_since_keeps_open_deals_and_drops_those_closed_before(client, db_session):
    _tx(db_session, reference="OPEN")
    _tx(db_session, reference="OLD", status="lost", closed_at=datetime(2026, 5, 1))
    _tx(db_session, reference="RECENT", status="won", closed_at=datetime(2026, 7, 10))
    refs = {t["reference"] for t in client.get("/backoffice/transactions?since=2026-06-24").json()["transactions"]}
    assert refs == {"OPEN", "RECENT"}
    assert len(client.get("/backoffice/transactions").json()["transactions"]) == 3


def test_invalid_since_is_rejected(client):
    r = client.get("/backoffice/transactions?since=hier")
    assert r.status_code == 400


def test_summary_keeps_sale_and_rent_apart(client, db_session):
    _tx(db_session, asking_price=2_000_000, commission_rate=3, probability=50)
    _tx(db_session, transaction_type="rent", asking_price=7_000, commission_rate=4, probability=100)
    _tx(db_session, status="won", final_price=800_000, commission_amount=28_000, closed_at=datetime(2026, 7, 3))
    _tx(db_session, transaction_type="rent", status="won", final_price=3_000, commission_rate=2.5,
        closed_at=datetime(2026, 7, 3))
    _tx(db_session, status="lost", asking_price=1_880_000, lost_reason="Prix trop élevé", closed_at=datetime(2026, 7, 12))
    _tx(db_session, status="lost", asking_price=1_270_000, lost_reason="Prix trop élevé", closed_at=datetime(2026, 7, 22))
    _tx(db_session, status="lost", asking_price=500_000, lost_reason="Ancien", closed_at=datetime(2026, 1, 5))
    _tx(db_session, agency_id=2, asking_price=9_999_999)  # autre agence : invisible

    s = client.get("/backoffice/transactions/summary?since=2026-06-24").json()
    assert s["sale"]["active"] == {"count": 1, "amount": 2_000_000, "commission": 60_000, "weighted_commission": 30_000}
    assert s["rent"]["active"] == {"count": 1, "amount": 7_000, "commission": 280, "weighted_commission": 280}
    assert s["sale"]["won"] == {"count": 1, "amount": 800_000, "commission": 28_000}
    assert s["rent"]["won"] == {"count": 1, "amount": 3_000, "commission": 75}
    assert s["sale"]["lost"] == {"count": 2, "amount": 3_150_000}
    assert s["lost_reasons"] == [{"reason": "Prix trop élevé", "count": 2}]


def test_summary_filters_by_agent_but_lists_every_agent(client, db_session):
    _tx(db_session, agent_id=7, asking_price=100)
    _tx(db_session, agent_id=8, asking_price=200)
    _tx(db_session, agent_id=8, asking_price=300)
    s = client.get("/backoffice/transactions/summary?agent_id=8").json()
    assert s["sale"]["active"]["count"] == 2
    assert s["agents"] == [{"id": 8, "name": "Karim Idrissi", "count": 2},
                           {"id": 7, "name": "Samira Alaoui", "count": 1}]
