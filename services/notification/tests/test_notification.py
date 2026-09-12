from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


def test_job_renouvellement_reveille_billing(monkeypatch):
    import httpx

    from app import scheduler

    calls = []

    class _Resp:
        status_code = 200

        def json(self):
            return {"issued": [{"subscription_id": 1}, {"subscription_id": 2}]}

    def fake_post(url, **kw):
        calls.append(url)
        return _Resp()

    monkeypatch.setattr(httpx, "post", fake_post)
    assert scheduler._job_subscription_renewals() == 2
    assert calls[0].endswith("/internal/subscriptions/issue-renewals")


def test_job_renouvellement_ne_leve_pas_si_billing_est_absent(monkeypatch):
    import httpx

    from app import scheduler

    def boom(url, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", boom)
    assert scheduler._job_subscription_renewals() == 0


def _capture_sends(monkeypatch):
    from app import handlers, recipients
    sent = []
    monkeypatch.setattr(recipients, "agency",
                        lambda agency_id: {"email": "agence@example.test", "name": "Agence Test"})
    monkeypatch.setattr(handlers, "_try_send",
                        lambda db, to, template, log_name, **ctx: sent.append((to, template, ctx)))
    return sent


def test_facture_emise_annoncee_a_l_agence(monkeypatch):
    from app import handlers
    sent = _capture_sends(monkeypatch)
    handlers._handle_invoice_created(None, {"purpose": "subscription", "agency_id": 4,
                                            "reference": "INV-2026-010", "amount": 499.0,
                                            "period_label": "Septembre 2026", "renewal": True,
                                            "grace_until": "2026-10-05T10:00:00"})
    assert [(to, tpl) for to, tpl, _ in sent] == [("agence@example.test", "invoice_issued.html")]


def test_facture_de_commission_ignoree(monkeypatch):
    from app import handlers
    sent = _capture_sends(monkeypatch)
    handlers._handle_invoice_created(None, {"purpose": "commission", "account_id": 9})
    assert sent == []


def test_echec_de_paiement_annonce_a_l_agence(monkeypatch):
    from app import handlers
    sent = _capture_sends(monkeypatch)
    handlers._handle_payment_failed(None, {"purpose": "subscription", "agency_id": 4,
                                           "reason_code": "card_declined",
                                           "reason_label": "Carte refusée"})
    assert sent[0][1] == "payment_failed.html"
    assert sent[0][2]["reason_label"] == "Carte refusée"


def test_gabarits_pointent_vers_la_page_d_abonnement_reelle():
    """`/backoffice/abonnement` n'existe pas dans le routeur frontend : les relances envoyaient
    vers une page introuvable. La page d'abonnement est `/dashboard/compte/abonnement`."""
    from app import render
    for template, ctx in (
        ("invoice_reminder.html", {"reference": "INV-1", "amount": 499, "reminder_count": 2,
                                   "grace_until": "5 octobre 2026"}),
        ("invoice_issued.html", {"reference": "INV-1", "amount": 499, "renewal": True,
                                 "grace_until": "5 octobre 2026"}),
        ("payment_failed.html", {"reason_label": None}),
    ):
        _, html, _ = render.render_email(template, **ctx)
        assert "/dashboard/compte/abonnement" in html
        assert "/backoffice/abonnement" not in html
