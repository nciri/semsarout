import app.main as m
from app.models import Candidature, ColocProperty, Listing

HEADERS = {"x-internal-token": "tok"}


def _property(**kw) -> ColocProperty:
    base = dict(owner_id=1, city="Casablanca", property_type="APPARTEMENT")
    return ColocProperty(**{**base, **kw})


def _listing(prop: ColocProperty, title: str = "Chambre 1", **kw) -> Listing:
    base = dict(property=prop, owner_id=1, title=title, bed_type="CHAMBRE_INDIVIDUELLE",
                rent="1200.00", housing_gender="FEMININ", status="PUBLIEE")
    return Listing(**{**base, **kw})


def _candidature(listing: Listing, candidate_user_id: int = 42,
                 status: str = "received") -> Candidature:
    return Candidature(listing=listing, listing_id=listing.id, candidate_user_id=candidate_user_id,
                       owner_id=1, status=status, message="Bonjour")


def test_attribution_forbidden_without_token(client):
    assert client.get("/internal/attribution").status_code == 403


def test_attribution_wrong_tenant_returns_empty(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    p = _property()
    db_session.add(p)
    db_session.add(_listing(p))
    db_session.commit()
    resp = client.get("/internal/attribution", params={"tenant": "semsar"}, headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json()["properties"] == []


def test_attribution_returns_rooms_and_candidatures(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    p = _property(neighborhood="Maârif", area_m2=18, amenities={"wifi": True, "cave": False})
    db_session.add(p)
    room = _listing(p, "Chambre Maârif")
    db_session.add(room)
    db_session.flush()
    db_session.add(_candidature(room))
    db_session.commit()
    body = client.get("/internal/attribution", headers=HEADERS).json()
    assert len(body["properties"]) == 1
    prop = body["properties"][0]
    assert prop["name"] == "Chambre Maârif"
    assert prop["place"] == "Maârif, Casablanca"
    assert prop["rooms"] == [{"id": room.id, "name": "Chambre Maârif",
                              "meta": "18 m² · CHAMBRE_INDIVIDUELLE · wifi",
                              "rent": 1200.0, "currency": "MAD"}]
    candidature = prop["candidatures"][0]
    assert candidature["listing_id"] == room.id
    assert candidature["candidate_user_id"] == 42
    assert candidature["status"] == "received"
    assert candidature["created_at"] is not None


def test_attribution_excludes_rejected_candidatures(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    p = _property()
    db_session.add(p)
    room = _listing(p)
    db_session.add(room)
    db_session.flush()
    db_session.add(_candidature(room, 42, "rejected"))
    db_session.add(_candidature(room, 43, "shortlisted"))
    db_session.commit()
    prop = client.get("/internal/attribution", headers=HEADERS).json()["properties"][0]
    assert [c["candidate_user_id"] for c in prop["candidatures"]] == [43]


def test_attribution_property_without_room_falls_back_to_property_type(client, db_session,
                                                                      monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    db_session.add(_property())
    db_session.commit()
    prop = client.get("/internal/attribution", headers=HEADERS).json()["properties"][0]
    assert prop["name"] == "APPARTEMENT"
    assert prop["rooms"] == [] and prop["candidatures"] == []


def test_attribution_honours_limit(client, db_session, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    for _ in range(3):
        db_session.add(_property())
    db_session.commit()
    body = client.get("/internal/attribution", params={"limit": 2}, headers=HEADERS).json()
    assert len(body["properties"]) == 2


def test_attribution_rejects_out_of_range_limit(client, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    assert client.get("/internal/attribution", params={"limit": 0},
                      headers=HEADERS).status_code == 422
