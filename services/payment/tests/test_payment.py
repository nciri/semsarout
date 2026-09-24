from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


def test_create_requires_auth():
    with TestClient(app) as client:
        resp = client.get("/my-payments")
        assert resp.status_code == 401


def test_webhook_echec_emet_payment_failed_une_seule_fois(client, db_session):
    """Un échec de paiement n'émettait rien : ni billing ni l'agence n'en apprenaient
    l'existence. Rejoué, il ne doit pas être émis deux fois."""
    from semsar_events import OutboxEvent

    from app.models import Payment
    db_session.add(Payment(reference="PAY-FAIL-1", payment_type="subscription", amount=499,
                           agency_id=12, user_id=3, status="pending"))
    db_session.commit()

    body = {"reference": "PAY-FAIL-1", "status": "failed", "reason_code": "card_declined",
            "reason": "Carte refusée par la banque"}
    assert client.post("/payments/webhook", json=body).status_code == 200
    assert client.post("/payments/webhook", json=body).status_code == 200

    events = db_session.query(OutboxEvent).filter_by(event_type="payment.failed").all()
    assert len(events) == 1
    payload = events[0].payload
    assert payload["agency_id"] == 12 and payload["user_id"] == 3
    assert payload["purpose"] == "subscription"
    assert payload["reason_code"] == "card_declined"
    assert payload["reason_label"] == "Carte refusée par la banque"


def test_webhook_echec_sans_motif_donne_unknown(client, db_session):
    """La passerelle simulée ne fournit pas de motif."""
    from semsar_events import OutboxEvent

    from app.models import Payment
    db_session.add(Payment(reference="PAY-FAIL-2", payment_type="subscription", amount=499,
                           agency_id=13, status="pending"))
    db_session.commit()

    client.post("/payments/webhook", json={"reference": "PAY-FAIL-2", "status": "failed"})

    payload = db_session.query(OutboxEvent).filter_by(event_type="payment.failed").one().payload
    assert payload["reason_code"] == "unknown"
    assert payload["reason_label"] is None


def _intent(client, **extra):
    body = {"purpose": "commission", "amount": 1500, "payment_method": "transfer"}
    return client.post("/payments/create-intent", json={**body, **extra},
                       headers={"x-semsar-user-id": "7", "x-semsar-agency-id": "1"})


def test_virement_refuse_tant_que_le_rib_nest_pas_configure(client, monkeypatch):
    """Mieux vaut refuser que d'afficher un RIB factice : le client y enverrait son argent."""
    monkeypatch.delenv("BANK_TRANSFER_RIB", raising=False)
    assert _intent(client).status_code == 503


def test_virement_renvoie_les_coordonnees_configurees(client, monkeypatch):
    monkeypatch.setenv("BANK_TRANSFER_RIB", "007 780 0001234567890123 45")
    monkeypatch.setenv("BANK_TRANSFER_BANK_NAME", "Banque Populaire")
    monkeypatch.setenv("BANK_TRANSFER_ACCOUNT_NAME", "SemsarOut SARL")
    body = _intent(client).json()
    assert body["bank_info"]["rib"] == "007 780 0001234567890123 45"
    assert body["bank_info"]["bank_name"] == "Banque Populaire"
    assert body["status"] == "pending_transfer"
