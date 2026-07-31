from fastapi.testclient import TestClient

from app.main import app


def test_create_commission_intent():
    with TestClient(app) as c:
        r = c.post("/payments/create-intent",
                   json={"purpose": "commission", "amount": 4999, "commission_ref": "rental:7",
                         "account_id": 42, "payment_method": "card"},
                   headers={"x-semsar-user-id": "42"})
        assert r.status_code == 200
        body = r.json()
        assert body["reference"].startswith("PAY-")
        assert "payment_url" in body
