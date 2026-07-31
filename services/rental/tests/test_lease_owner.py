from app import models, main


def test_lease_has_owner_columns(db_session):
    l = models.Lease(property_id=1, owner_id=5, tenant_user_id=10, reference="B-1", status="draft")
    db_session.add(l)
    db_session.commit()
    assert l.owner_id == 5 and l.tenant_user_id == 10


def test_emit_lease_payload_has_account_id(db_session):
    captured = {}
    import app.main as m
    m_enqueue = m.enqueue
    try:
        m.enqueue = lambda db, at, aid, et, payload: captured.update(payload)
        l = models.Lease(id=7, property_id=1, owner_id=5, reference="B-2", status="active")
        m._emit_lease(db_session, l, "rental.lease.signed")
    finally:
        m.enqueue = m_enqueue
    assert captured["account_id"] == 5
