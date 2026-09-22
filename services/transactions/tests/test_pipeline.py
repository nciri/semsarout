"""Page Pipeline : date d'entrée dans l'étape, constats calculés et enrichissement de GET /pipeline."""
from datetime import datetime, timedelta

from app.insights import closed_recent, flags_for
from app.models import PropertyRO, Transaction

NOW = datetime(2026, 7, 27, 9, 0)


def _row(id, **kw):
    base = {"id": id, "reference": f"TX-{id}", "client_id": 1, "client_name": "Client", "property_id": 1,
            "transaction_type": "sale", "stage": "negotiation", "status": "active", "probability": 60,
            "asking_price": 1000.0, "offer_price": None, "final_price": None,
            "expected_closing_date": NOW + timedelta(days=90), "stage_entered_at": NOW - timedelta(days=3),
            "closed_at": None, "lost_reason": None, "property_status": "pending"}
    return {**base, **kw}


def _codes(t, rows):
    return [(f["code"], f["severity"]) for f in flags_for(t, rows, NOW)]


def test_a_healthy_file_has_no_flag():
    t = _row(1)
    assert flags_for(t, [t], NOW) == []


def test_duplicate_of_a_won_file_is_critical_and_sorted_first():
    t = _row(1, stage_entered_at=NOW - timedelta(days=25))
    won = _row(2, status="won", final_price=783661.19, closed_at=NOW - timedelta(days=31))
    flags = flags_for(t, [t, won], NOW)
    assert [f["code"] for f in flags] == ["duplicate", "stale"]
    assert flags[0]["params"] == {"ref": "TX-2", "status": "won", "date": "2026-06-26", "amount": 783661.19}


def test_stale_turns_red_after_30_days_only():
    assert _codes(_row(1, stage_entered_at=NOW - timedelta(days=21)), []) == []
    assert _codes(_row(1, stage_entered_at=NOW - timedelta(days=29)), []) == [("stale", "warn")]
    assert _codes(_row(1, stage_entered_at=NOW - timedelta(days=32)), []) == [("stale", "crit")]


def test_close_date_unrealistic_before_the_offer_is_passed_and_overdue_when_past():
    early = _row(1, stage="visit", expected_closing_date=NOW + timedelta(days=29))
    assert _codes(early, []) == [("unrealistic_close", "warn")]
    # Au compromis, un mois pour l'acte est normal.
    assert _codes(_row(1, stage="compromise", expected_closing_date=NOW + timedelta(days=29)), []) == []
    assert _codes(_row(1, expected_closing_date=NOW - timedelta(days=2)), []) == [("overdue", "warn")]
    # Une location se signe vite : pas de délai « irréaliste ».
    assert _codes(_row(1, transaction_type="rent", stage="visit",
                       expected_closing_date=NOW + timedelta(days=10)), []) == []


def test_certain_probability_without_closing():
    assert _codes(_row(1, stage="final_act", probability=100), []) == [("certain_not_closed", "warn")]


def test_two_applicants_for_one_rental_but_competing_buyers_are_normal():
    a = _row(1, transaction_type="rent", stage="verification")
    b = _row(2, transaction_type="rent", stage="verification", client_id=2, client_name="Ahmed Kettani")
    flags = flags_for(a, [a, b], NOW)
    assert [f["code"] for f in flags] == ["rival_applicant"]
    assert flags[0]["params"]["client"] == "Ahmed Kettani"
    assert flags_for(_row(1), [_row(1), _row(2, client_id=2)], NOW) == []


def test_lost_before_uses_the_latest_real_loss_and_ignores_archiving():
    t = _row(1, client_id=9)
    old = _row(2, status="lost", stage="offer", lost_reason="Prix trop élevé", offer_price=900.0,
               closed_at=NOW - timedelta(days=40))
    recent = _row(3, status="lost", stage="negotiation", lost_reason="Prix trop élevé", offer_price=950.0,
                  closed_at=NOW - timedelta(days=15))
    archived = _row(4, status="lost", lost_reason="Archived", closed_at=NOW - timedelta(days=1))
    flags = flags_for(t, [t, old, recent, archived], NOW)
    assert [f["code"] for f in flags] == ["lost_before"]
    assert flags[0]["params"]["ref"] == "TX-3" and flags[0]["params"]["amount"] == 950.0


def test_property_marked_sold_or_rented_in_catalogue():
    assert _codes(_row(1, property_status="rented"), []) == [("property_status", "info")]
    assert _codes(_row(1, property_status="active"), []) == []


def test_closed_recent_keeps_30_days_and_skips_archiving():
    rows = [_row(1, status="won", final_price=10.0, closed_at=NOW - timedelta(days=5)),
            _row(2, status="lost", lost_reason="Client a trouvé ailleurs", closed_at=NOW - timedelta(days=20)),
            _row(3, status="lost", lost_reason="Archived", closed_at=NOW - timedelta(days=2)),
            _row(4, status="lost", closed_at=NOW - timedelta(days=45)), _row(5)]
    out = closed_recent(rows, NOW)
    assert [o["id"] for o in out] == [1, 2]
    assert out[0]["amount"] == 10.0


# ---- API ----
def _tx(db, id, **kw):
    fields = {"reference": f"TX-{id}", "property_id": 1, "client_id": 1, "agent_id": 17,
              "transaction_type": "sale", "stage": "visit", "status": "active", "agency_id": 1,
              "asking_price": 1000, "probability": 50, "created_at": datetime.utcnow() - timedelta(days=60)}
    t = Transaction(id=id, **{**fields, **kw})
    db.add(t)
    db.commit()
    return t


def test_move_dates_the_stage_entry_and_undo_restores_it(client, db_session):
    _tx(db_session, 1, stage_entered_at=datetime(2026, 6, 1))
    r = client.post("/backoffice/transactions/1/move", json={"stage": "offer", "order": 0})
    assert r.status_code == 200
    entered = datetime.fromisoformat(r.json()["stage_entered_at"])
    assert datetime.utcnow() - entered < timedelta(minutes=1)

    r = client.post("/backoffice/transactions/1/move",
                    json={"stage": "visit", "order": 0, "stage_entered_at": "2026-06-01T00:00:00"})
    assert r.json()["stage"] == "visit"
    assert r.json()["stage_entered_at"] == "2026-06-01T00:00:00"


def test_moving_to_the_same_stage_keeps_the_date(client, db_session):
    _tx(db_session, 1, stage_entered_at=datetime(2026, 6, 1))
    r = client.post("/backoffice/transactions/1/move", json={"stage": "visit", "order": 0})
    assert r.json()["stage_entered_at"] == "2026-06-01T00:00:00"


def test_update_stage_through_put_also_dates_the_entry(client, db_session):
    _tx(db_session, 1, stage_entered_at=datetime(2026, 6, 1))
    r = client.put("/backoffice/transactions/1", json={"stage": "negotiation"})
    assert r.json()["stage_order"] == 3
    assert r.json()["stage_entered_at"] != "2026-06-01T00:00:00"


def test_pipeline_is_enriched_and_agent_filter_keeps_flags_from_the_whole_agency(client, db_session):
    db_session.add(PropertyRO(id=1, title="Loft", city="Meknès", status="rented"))
    db_session.commit()
    _tx(db_session, 1, agent_id=17, stage_entered_at=datetime.utcnow() - timedelta(days=40))
    _tx(db_session, 2, agent_id=18, status="won", final_price=900, closed_at=datetime.utcnow() - timedelta(days=3))
    _tx(db_session, 3, agent_id=18, transaction_type="rent")  # jamais mêlé aux ventes

    body = client.get("/backoffice/transactions/pipeline?type=sale&agent_id=17").json()
    cards = [t for s in body["pipeline"] for t in s["transactions"]]
    assert [t["id"] for t in cards] == [1]
    assert cards[0]["days_in_stage"] == 40
    assert [f["code"] for f in cards[0]["flags"]] == ["duplicate", "stale", "property_status"]
    assert [c["id"] for c in body["closed_recent"]] == [2]
    assert body["as_of"]
    # Contrat historique conservé.
    assert {"pipeline", "stages"} <= body.keys() and cards[0]["reference"] == "TX-1"


def test_created_file_gets_a_stage_entry_date(client):
    r = client.post("/backoffice/transactions", json={"property_id": 1, "client_id": 1, "agent_id": 17})
    assert r.status_code == 201 and r.json()["stage_entered_at"]
