from app.trust_client import batch


def test_batch_returns_empty_for_empty_input():
    assert batch([]) == {}


def test_batch_returns_defaults_on_connection_error(monkeypatch):
    import httpx

    def _raise(*a, **k):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(httpx, "get", _raise)
    result = batch([1, 2])
    assert result == {1: {"level": "none", "deal_count": 0}, 2: {"level": "none", "deal_count": 0}}


def test_batch_returns_defaults_on_non_200(monkeypatch):
    import httpx

    class _Resp:
        status_code = 500
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Resp())
    assert batch([1]) == {1: {"level": "none", "deal_count": 0}}


def test_batch_parses_response(monkeypatch):
    import httpx

    class _Resp:
        status_code = 200
        def json(self):
            return {"items": {"1": {"level": "verified", "deal_count": 3},
                              "2": {"level": "none", "deal_count": 0}}}
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Resp())
    result = batch([1, 2])
    assert result[1] == {"level": "verified", "deal_count": 3}
    assert result[2] == {"level": "none", "deal_count": 0}


def test_get_agency_includes_trust_fields(client, db_session, monkeypatch):
    import app.main as m
    monkeypatch.setattr(
        m.trust_client, "batch",
        lambda ids: {i: {"level": "verified_experience", "deal_count": 5} for i in ids})
    from app.models import Agency
    a = Agency(name="Test Agency", slug="test-agency", email="a@example.com", is_verified=True)
    db_session.add(a)
    db_session.commit()
    resp = client.get(f"/agencies/{a.slug}")
    assert resp.status_code == 200
    body = resp.json()["agency"]
    assert body["trust_level"] == "verified_experience"
    assert body["deal_count"] == 5


def test_get_agency_defaults_trust_when_absent(client, db_session, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.trust_client, "batch", lambda ids: {})
    from app.models import Agency
    a = Agency(name="No Trust", slug="no-trust", email="b@example.com", is_verified=True)
    db_session.add(a)
    db_session.commit()
    resp = client.get(f"/agencies/{a.slug}")
    body = resp.json()["agency"]
    assert body["trust_level"] == "none"
    assert body["deal_count"] == 0


def test_internal_agencies_filters_by_owner_id(client, db_session, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    from app.models import Agency
    db_session.add_all([
        Agency(name="Owned", slug="owned", email="o@example.com", owner_id=5),
        Agency(name="Other", slug="other", email="x@example.com", owner_id=9),
    ])
    db_session.commit()
    resp = client.get("/internal/agencies", params={"owner_id": 5}, headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    agencies = resp.json()["agencies"]
    assert len(agencies) == 1
    assert agencies[0]["name"] == "Owned"


def test_internal_agencies_without_owner_id_returns_all(client, db_session, monkeypatch):
    import app.main as m
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    from app.models import Agency
    db_session.add_all([
        Agency(name="A", slug="a", email="a@example.com", owner_id=5),
        Agency(name="B", slug="b", email="b@example.com", owner_id=9),
    ])
    db_session.commit()
    resp = client.get("/internal/agencies", headers={"x-internal-token": "tok"})
    assert len(resp.json()["agencies"]) == 2
