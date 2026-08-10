from app.models import Partner, Webhook, WebhookDelivery
from app.worker import dispatch_event


def _partner(db) -> Partner:
    p = Partner(name="U", type="UNIVERSITE", tenant="m3a-l3achrane")
    db.add(p)
    db.commit()
    return p


def _webhook(db, partner_id, events, active=True) -> Webhook:
    w = Webhook(partner_id=partner_id, url="https://example.org/hook", events=events,
                secret="s3cr3t", active=active)
    db.add(w)
    db.commit()
    return w


def _no_sleep(attempt):
    return None


def test_dispatch_delivers_to_subscribed_active_webhooks_only(db_session):
    partner = _partner(db_session)
    subscribed = _webhook(db_session, partner.id, ["partner.grant_paid"])
    _webhook(db_session, partner.id, ["partner.invoice_sent"])  # non abonné
    _webhook(db_session, partner.id, ["partner.grant_paid"], active=False)  # inactif

    calls = []

    def post(url, data, headers):
        calls.append(url)
        return 200

    deliveries = dispatch_event(db_session, partner.id, "partner.grant_paid", {"grant_id": "g1"},
                                 post=post, sleep=_no_sleep)
    db_session.commit()

    assert len(calls) == 1
    assert len(deliveries) == 1
    assert deliveries[0].webhook_id == subscribed.id
    assert deliveries[0].status == "DELIVERED"

    persisted = db_session.query(WebhookDelivery).all()
    assert len(persisted) == 1


def test_dispatch_is_scoped_by_partner(db_session):
    p1 = _partner(db_session)
    p2 = _partner(db_session)
    _webhook(db_session, p1.id, ["partner.grant_paid"])
    _webhook(db_session, p2.id, ["partner.grant_paid"])

    calls = []

    def post(url, data, headers):
        calls.append(url)
        return 200

    deliveries = dispatch_event(db_session, p1.id, "partner.grant_paid", {"grant_id": "g1"},
                                 post=post, sleep=_no_sleep)

    assert len(calls) == 1  # jamais le webhook de p2
    assert len(deliveries) == 1
    assert deliveries[0].webhook_id is not None


def test_dispatch_records_failed_delivery_on_persistent_error(db_session):
    partner = _partner(db_session)
    webhook = _webhook(db_session, partner.id, ["partner.grant_paid"])

    def post(url, data, headers):
        return 500

    deliveries = dispatch_event(db_session, partner.id, "partner.grant_paid", {"grant_id": "g1"},
                                 post=post, sleep=_no_sleep)

    assert len(deliveries) == 1
    assert deliveries[0].status == "FAILED"
    assert deliveries[0].attempts == 3
    assert deliveries[0].webhook_id == webhook.id
