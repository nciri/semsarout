import pytest
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


def _fake_stay_messages(monkeypatch, messages):
    """Fait répondre `staymanager` et capture les verdicts rendus à l'ordonnanceur."""
    import httpx

    from app import scheduler

    verdicts = []

    class _Resp:
        status_code = 200

        def __init__(self, payload):
            self._payload = payload

        def json(self):
            return self._payload

    def fake_get(url, **kw):
        assert url.endswith("/internal/sejours/messages/due")
        return _Resp({"messages": messages})

    def fake_post(url, **kw):
        verdicts.append((url, kw.get("json")))
        return _Resp({"ok": True})

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)
    return scheduler, verdicts


def _capture_scheduler_sends(monkeypatch):
    """L'ordonnanceur importe `_try_send` par son nom : c'est sa référence qu'il faut remplacer."""
    from app import scheduler
    sent = []
    monkeypatch.setattr(scheduler, "_try_send",
                        lambda db, to, template, log_name, **ctx: sent.append((to, template, ctx)))
    return sent


def test_job_messagerie_sejour_envoie_et_rend_son_verdict(monkeypatch):
    sent = _capture_scheduler_sends(monkeypatch)
    scheduler, verdicts = _fake_stay_messages(monkeypatch, [
        {"id": 7, "agency_id": 4, "recipient": "voyageur@example.com",
         "subject": "Votre arrivée", "body": "Bonjour Salma"},
    ])
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        assert scheduler._job_stay_messages(db) == 1
    finally:
        db.close()
    assert sent and sent[0][0] == "voyageur@example.com"
    assert verdicts[0][0].endswith("/internal/sejours/messages/7/sent")
    assert verdicts[0][1] == {"error": ""}


def test_job_messagerie_sejour_signale_un_destinataire_invalide(monkeypatch):
    sent = _capture_scheduler_sends(monkeypatch)
    scheduler, verdicts = _fake_stay_messages(monkeypatch, [
        {"id": 8, "agency_id": 4, "recipient": "pas-une-adresse",
         "subject": "Votre arrivée", "body": "Bonjour"},
    ])
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        assert scheduler._job_stay_messages(db) == 0
    finally:
        db.close()
    assert sent == []
    assert verdicts[0][1]["error"]


def test_les_routes_de_suivi_exigent_le_super_admin():
    """Journal des envois et exécution des tâches : hors super-admin, rien ne doit filtrer."""
    with TestClient(app) as client:
        assert client.get("/admin/notifications").status_code in (401, 403)
        assert client.post("/admin/scheduler/run").status_code in (401, 403)


def test_le_journal_masque_les_adresses(monkeypatch):
    from app.main import _masked

    assert _masked("salma.bennani@example.com") == "s***i@example.com"
    assert _masked("ab@example.com") == "a***@example.com"
    assert _masked("") == ""


def test_un_passage_deja_en_cours_est_refuse(monkeypatch):
    from semsar_auth import Principal, require_superadmin

    from app import scheduler

    scheduler._RUN_LOCK.acquire()
    app.dependency_overrides[require_superadmin] = lambda: Principal(
        sub="1", roles=["superadmin"], agency_id=None, is_superadmin=True, features=[], claims={})
    try:
        with TestClient(app) as client:
            assert client.post("/admin/scheduler/run").status_code == 409
    finally:
        app.dependency_overrides.clear()
        scheduler._RUN_LOCK.release()


def test_le_super_admin_rejoue_les_taches_planifiees(monkeypatch):
    from semsar_auth import Principal, require_superadmin

    from app import scheduler

    ran = []
    monkeypatch.setattr(scheduler, "run_once", lambda: ran.append(True))
    monkeypatch.setattr(scheduler, "load_dotenv", lambda: None)
    app.dependency_overrides[require_superadmin] = lambda: Principal(
        sub="1", roles=["superadmin"], agency_id=None, is_superadmin=True, features=[], claims={})
    try:
        with TestClient(app) as client:
            assert client.post("/admin/scheduler/run").json() == {"ok": True}
    finally:
        app.dependency_overrides.clear()
    assert ran == [True]


class _FakeDb:
    def commit(self):
        pass


def _fake_crg(monkeypatch, drafts, reports, ack_status=200, mail_ok=True, ack_error=None):
    """Fait répondre `rental` (due-crg, due-crg-send, crg-sent) et journalise l'ordre des appels."""
    import httpx

    from app import recipients, scheduler

    events = []

    class _Resp:
        def __init__(self, payload, status=200):
            self._payload, self.status_code = payload, status

        def json(self):
            return self._payload

    def fake_get(url, **kw):
        if url.endswith("/due-crg"):
            return _Resp({"drafts": drafts})
        assert url.endswith("/due-crg-send")
        return _Resp({"reports": reports})

    def fake_post(url, **kw):
        events.append(("crg-sent", url, kw.get("json")))
        if ack_error:
            raise ack_error
        return _Resp({"ok": True}, ack_status)

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(recipients, "agency", lambda i: {"email": "agence@example.com", "name": "Atlas"})
    monkeypatch.setattr(recipients, "client", lambda i: {"email": "proprio@example.com", "name": "Salma"})
    monkeypatch.setattr(scheduler, "_try_send",
                        lambda db, to, template, log_name, **ctx:
                        events.append(("mail", to, template, ctx)) or mail_ok)
    return scheduler, events


_REPORT = {"mandate_id": 3, "crg_id": 9, "landlord_client_id": 5, "period_label": "Septembre 2026",
           "rent_collected": 6000, "fees": 480, "expenses": 1200, "net": 4320}


def test_crg_n_avertit_l_agence_que_des_brouillons_nouveaux_et_n_ecrit_pas_au_proprio(monkeypatch):
    scheduler, events = _fake_crg(monkeypatch, drafts=[
        {"mandate_id": 3, "crg_id": 9, "agency_id": 4, "period_label": "Septembre 2026", "created": True},
        {"mandate_id": 4, "crg_id": 10, "agency_id": 4, "period_label": "Septembre 2026", "created": False},
    ], reports=[])
    assert scheduler._job_crg_reports(_FakeDb()) == 0
    assert [(e[0], e[1], e[2]) for e in events] == [("mail", "agence@example.com", "crg_draft.html")]


def test_crg_marque_envoye_avant_d_ecrire_au_proprio(monkeypatch):
    scheduler, events = _fake_crg(monkeypatch, drafts=[], reports=[_REPORT])
    assert scheduler._job_crg_reports(_FakeDb()) == 1
    assert [e[0] for e in events] == ["crg-sent", "mail"]
    assert events[0][1].endswith("/internal/mandates/3/crg-sent") and events[0][2] == {"crg_id": 9}
    assert events[1][1] == "proprio@example.com" and events[1][3]["expenses"] == 1200


def test_crg_dont_le_marquage_echoue_ne_part_pas_et_se_voit_dans_les_logs(monkeypatch, caplog):
    scheduler, events = _fake_crg(monkeypatch, drafts=[], reports=[_REPORT], ack_status=503)
    assert scheduler._job_crg_reports(_FakeDb()) == 0
    assert [e[0] for e in events] == ["crg-sent"]
    assert "503" in caplog.text


def test_crg_sans_email_proprietaire_n_est_ni_envoye_ni_marque(monkeypatch):
    from app import recipients

    scheduler, events = _fake_crg(monkeypatch, drafts=[], reports=[_REPORT])
    monkeypatch.setattr(recipients, "client", lambda i: {"email": "", "name": "Salma"})
    assert scheduler._job_crg_reports(_FakeDb()) == 0
    assert events == []


@pytest.mark.parametrize("expenses", [0, 1200])
def test_gabarit_crg_affiche_les_depenses_et_reste_lisible_a_zero(expenses):
    from app import render

    _, html, _ = render.render_email("crg_report.html", name="Salma", period_label="Septembre 2026",
                                     rent_collected=6000, fees=480, expenses=expenses, net=4320)
    assert "Dépenses d'intervention" in html.replace("&#39;", "'")
    assert html.index("Honoraires") < html.index("Dépenses") < html.index("Net reversé")


def test_crg_dont_le_marquage_est_injoignable_ne_part_pas_et_se_voit_dans_les_logs(monkeypatch, caplog):
    import httpx

    scheduler, events = _fake_crg(monkeypatch, drafts=[], reports=[_REPORT],
                                  ack_error=httpx.ConnectError("rental down"))
    assert scheduler._job_crg_reports(_FakeDb()) == 0
    assert [e[0] for e in events] == ["crg-sent"]
    assert "injoignable" in caplog.text


def test_crg_dont_l_email_echoue_apres_le_marquage_n_est_pas_compte_et_se_voit(monkeypatch, caplog):
    scheduler, events = _fake_crg(monkeypatch, drafts=[], reports=[_REPORT], mail_ok=False)
    assert scheduler._job_crg_reports(_FakeDb()) == 0
    assert [e[0] for e in events] == ["crg-sent", "mail"]
    assert "CRG 9" in caplog.text and "échec" in caplog.text


def test_crg_une_entree_malformee_n_arrete_pas_le_lot(monkeypatch, caplog):
    scheduler, events = _fake_crg(monkeypatch, drafts=[], reports=[{"landlord_client_id": 5}, _REPORT])
    assert scheduler._job_crg_reports(_FakeDb()) == 1
    assert "incomplète" in caplog.text


def test_crg_contrat_de_liste_rompu_est_signale(monkeypatch, caplog):
    scheduler, events = _fake_crg(monkeypatch, drafts=[], reports=[])
    monkeypatch.setattr(scheduler.httpx, "get", lambda url, **kw: type(
        "R", (), {"status_code": 200, "json": lambda self: {"renamed": []}})())
    assert scheduler._job_crg_reports(_FakeDb()) == 0
    assert "clé" in caplog.text


def test_crg_liste_en_erreur_http_est_signalee(monkeypatch, caplog):
    scheduler, events = _fake_crg(monkeypatch, drafts=[], reports=[])
    monkeypatch.setattr(scheduler.httpx, "get", lambda url, **kw: type(
        "R", (), {"status_code": 500, "json": lambda self: {}})())
    assert scheduler._job_crg_reports(_FakeDb()) == 0
    assert "HTTP 500" in caplog.text


def test_crg_agence_sans_email_est_signalee(monkeypatch, caplog):
    from app import recipients

    scheduler, events = _fake_crg(monkeypatch, drafts=[
        {"mandate_id": 3, "crg_id": 9, "agency_id": 4, "period_label": "Septembre 2026", "created": True}],
        reports=[])
    monkeypatch.setattr(recipients, "agency", lambda i: {"email": ""})
    scheduler._job_crg_reports(_FakeDb())
    assert events == [] and "agence 4" in caplog.text


def test_gabarit_crg_draft_se_rend_avec_son_lien():
    from app import render

    _, html, _ = render.render_email("crg_draft.html", agency_name="Atlas", period_label="Septembre 2026")
    assert "Septembre 2026" in html and "/backoffice/gestion-locative" in html


def test_gabarit_lead_projette_le_message_anonyme_en_texte():
    """`lead.message` est le seul champ riche du produit dont l'auteur est **anonyme** : les
    formulaires de contact publics n'ont aucune authentification.

    Le rendre en HTML mettrait un lien d'hameçonnage cliquable dans la boîte de l'agence,
    dans un email de sa propre plateforme. La liste blanche conserve `<a href>` : assainir ne
    ferme pas ce trou, seule la projection en texte le ferme. Le texte visible, lui, doit
    arriver intact — l'agence doit lire ce que le prospect a écrit."""
    from app import render

    _, html, text = render.render_email(
        "lead_notification.html", lead_name="Hind", lead_email="h@example.ma",
        lead_message='<p>Votre <strong>facture</strong></p>'
                     '<p><a href="https://evil.example">cliquez</a></p>')

    # La cellule du message, isolée du reste du gabarit (qui a son propre bouton d'action).
    cellule = html[html.index("white-space:pre-line"):]
    cellule = cellule[:cellule.index("</td>")]

    # Aucune balise, et surtout aucun lien : ni la balise, ni l'attribut, ni l'URL.
    assert "<a" not in cellule and "href" not in cellule
    assert "evil.example" not in html
    assert "<strong>" not in cellule
    # Les mots visibles traversent, sauts de ligne compris.
    assert "Votre facture" in cellule and "cliquez" in cellule
    # Et rien n'est lu comme du balisage : les chevrons d'un message hostile sont échappés.
    _, html2, _ = render.render_email(
        "lead_notification.html", lead_name="Hind",
        lead_message="Budget &lt; 900000 &amp; cash")
    assert "Budget &lt; 900000 &amp; cash" in html2
    assert "Villa" not in text


def test_gabarit_ordre_de_service_rend_les_notes_wysiwyg():
    from app import render

    _, html, _ = render.render_email(
        "work_order.html", title="Fuite cuisine", artisan_name="Omar",
        notes="<ul><li>Robinet <em>HS</em></li></ul><iframe src=\"x\"></iframe>")

    assert "<ul><li>Robinet <em>HS</em></li></ul>" in html
    assert "&lt;ul&gt;" not in html
    assert "<iframe" not in html
