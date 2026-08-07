import app.main as m


def test_lifestyle_referential_requires_token(client):
    assert client.get("/internal/lifestyle-referential").status_code == 403


def test_lifestyle_referential_payload(client, monkeypatch):
    monkeypatch.setattr(m.settings, "internal_token", "tok")
    resp = client.get("/internal/lifestyle-referential", headers={"x-internal-token": "tok"})
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"questions", "importance_levels"}
    assert body["questions"]["coucher"] == ["avant22", "22h-minuit", "apres-minuit"]
    assert len(body["questions"]) == 13
    assert body["importance_levels"] == ["DECISIF", "INDIFFERENT", "PREFERENCE"]
