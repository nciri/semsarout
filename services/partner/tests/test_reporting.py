from app.models import Partner, PartnerMember


def _member(db_session, user_id: int) -> Partner:
    partner = Partner(name="Univ. Test", type="UNIVERSITE")
    db_session.add(partner)
    db_session.flush()
    db_session.add(PartnerMember(partner_id=partner.id, user_id=user_id, role="ADMIN"))
    db_session.commit()
    return partner


def test_reporting_scoped(client, db_session, headers):
    _member(db_session, 7)
    client.post("/partner/affilies", headers=headers(7), json={"full_name": "A", "email": "a@x.ma"})
    rep = client.get("/partner/reporting", headers=headers(7)).json()
    assert rep["affilies"]["total"] >= 1
    assert "verifications" in rep and "grants" in rep and "invoices" in rep


def test_reporting_does_not_leak_other_partner(client, db_session, headers):
    _member(db_session, 7)
    _member(db_session, 8)
    client.post("/partner/affilies", headers=headers(7), json={"full_name": "A", "email": "a@x.ma"})
    rep8 = client.get("/partner/reporting", headers=headers(8)).json()
    assert rep8["affilies"]["total"] == 0


def test_internal_stats_requires_token(client):
    assert client.get("/internal/stats").status_code == 403
