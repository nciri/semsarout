def _member(db, uid=7):
    from app.models import Partner, PartnerMember
    p = Partner(name="U", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p); db.flush(); db.add(PartnerMember(partner_id=p.id, user_id=uid, role="OWNER")); db.commit()
    return p


def test_webhook_create_shows_secret_once_then_hidden(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/webhooks", headers=headers(7),
                     json={"url": "https://example.org/hook", "events": ["partner.grant_paid"]})
    assert r.status_code == 201
    body = r.json()
    assert body["secret"]  # brut présent à la création
    lst = client.get("/partner/webhooks", headers=headers(7)).json()
    assert all("secret" not in w for w in lst)  # jamais re-exposé


def test_webhook_crud_scoped_by_partner(client, db_session, headers):
    _member(db_session, 7)
    _member(db_session, 8)
    wid = client.post("/partner/webhooks", headers=headers(7),
                       json={"url": "https://example.org/hook", "events": ["partner.grant_paid"]}
                       ).json()["id"]

    # invisible pour un autre partenaire
    assert all(w["id"] != wid for w in client.get("/partner/webhooks", headers=headers(8)).json())
    assert client.patch(f"/partner/webhooks/{wid}", headers=headers(8),
                         json={"active": False}).status_code == 404
    assert client.delete(f"/partner/webhooks/{wid}", headers=headers(8)).status_code == 404

    r = client.patch(f"/partner/webhooks/{wid}", headers=headers(7), json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False

    assert client.delete(f"/partner/webhooks/{wid}", headers=headers(7)).status_code == 200
    assert all(w["id"] != wid for w in client.get("/partner/webhooks", headers=headers(7)).json())


def test_webhook_create_rejects_unknown_event(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/webhooks", headers=headers(7),
                     json={"url": "https://example.org/hook", "events": ["not.a.real.event"]})
    assert r.status_code == 422


def test_webhook_test_delivers_signed_event_and_records_delivery(client, db_session, headers, monkeypatch):
    _member(db_session, 7)
    wid = client.post("/partner/webhooks", headers=headers(7),
                       json={"url": "https://example.org/hook", "events": ["partner.test"]}
                       ).json()["id"]

    calls = []

    def fake_post(url, data, headers_):
        calls.append((url, headers_["X-Partner-Event"], headers_["X-Partner-Signature"]))
        return 200

    import app.main as main_module
    monkeypatch.setattr(main_module, "_http_post", fake_post)

    r = client.post(f"/partner/webhooks/{wid}/test", headers=headers(7))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "DELIVERED"
    assert len(calls) == 1
    assert calls[0][1] == "partner.test"
    assert calls[0][2].startswith("sha256=")

    from app.models import WebhookDelivery
    deliveries = db_session.query(WebhookDelivery).filter(WebhookDelivery.webhook_id == wid).all()
    assert len(deliveries) == 1
    assert deliveries[0].event_type == "partner.test"
    assert deliveries[0].status == "DELIVERED"


def test_webhook_test_not_found_for_other_partner(client, db_session, headers):
    _member(db_session, 7)
    _member(db_session, 8)
    wid = client.post("/partner/webhooks", headers=headers(7),
                       json={"url": "https://example.org/hook", "events": ["partner.test"]}
                       ).json()["id"]
    assert client.post(f"/partner/webhooks/{wid}/test", headers=headers(8)).status_code == 404


def test_webhook_create_rejects_ssrf_urls(client, db_session, headers):
    _member(db_session, 7)
    for bad_url in (
        "http://example.org/hook",  # schéma non-https
        "http://localhost/hook",
        "https://localhost/hook",
        "https://127.0.0.1/hook",
        "https://169.254.169.254/latest/meta-data",  # métadonnées cloud
        "https://10.0.0.5/hook",
        "https://172.16.0.5/hook",
        "https://192.168.1.5/hook",
        "https://[::1]/hook",
        "https://internal/hook",  # hôte sans point
        "https://127.1/hook",  # IPv4 raccourci → 127.0.0.1
        "https://0177.0.0.1/hook",  # IPv4 octal → 127.0.0.1
        "https://0x7f.0.0.1/hook",  # IPv4 hex → 127.0.0.1
        "https://169.254.169.254./latest/meta-data",  # FQDN à point final
    ):
        r = client.post("/partner/webhooks", headers=headers(7),
                         json={"url": bad_url, "events": ["partner.grant_paid"]})
        assert r.status_code == 422, f"{bad_url} devrait être refusé, reçu {r.status_code}"


def test_webhook_create_accepts_valid_https_url(client, db_session, headers):
    _member(db_session, 7)
    r = client.post("/partner/webhooks", headers=headers(7),
                     json={"url": "https://hooks.example.com/x", "events": ["partner.grant_paid"]})
    assert r.status_code == 201, r.text


def test_webhook_update_rejects_ssrf_url(client, db_session, headers):
    _member(db_session, 7)
    wid = client.post("/partner/webhooks", headers=headers(7),
                       json={"url": "https://example.org/hook", "events": ["partner.grant_paid"]}
                       ).json()["id"]
    r = client.patch(f"/partner/webhooks/{wid}", headers=headers(7),
                      json={"url": "http://169.254.169.254/latest/meta-data"})
    assert r.status_code == 422
