from app.models import TranslationCache


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_translate_miss_calls_azure_and_caches(client, db_session, fake_azure):
    resp = client.post(
        "/v1/translate", json={"texts": ["Bonjour"], "target": "ar", "source": "fr"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["translations"] == [
        {"source": "Bonjour", "translated": "[ar] Bonjour", "cached": False}
    ]
    assert len(fake_azure.calls) == 1
    assert db_session.query(TranslationCache).count() == 1


def test_translate_hit_does_not_call_azure_again(client, fake_azure):
    payload = {"texts": ["Bonjour"], "target": "ar", "source": "fr"}
    first = client.post("/v1/translate", json=payload)
    assert first.json()["translations"][0]["cached"] is False
    assert len(fake_azure.calls) == 1

    second = client.post("/v1/translate", json=payload)
    assert second.status_code == 200
    body = second.json()
    assert body["translations"] == [
        {"source": "Bonjour", "translated": "[ar] Bonjour", "cached": True}
    ]
    # Azure n'est PAS rappelé sur le hit.
    assert len(fake_azure.calls) == 1


def test_translate_mixed_batch_single_azure_call_for_missing(client, fake_azure):
    # Pré-chauffe le cache avec un seul texte.
    client.post("/v1/translate", json={"texts": ["Bonjour"], "target": "ar", "source": "fr"})
    assert len(fake_azure.calls) == 1

    resp = client.post(
        "/v1/translate",
        json={"texts": ["Bonjour", "Au revoir", "Merci"], "target": "ar", "source": "fr"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert [t["cached"] for t in body["translations"]] == [True, False, False]
    assert [t["source"] for t in body["translations"]] == ["Bonjour", "Au revoir", "Merci"]
    # Un seul appel Azure supplémentaire, groupant les 2 textes manquants.
    assert len(fake_azure.calls) == 2
    assert sorted(fake_azure.calls[1]) == ["Au revoir", "Merci"]


def test_translate_duplicate_texts_dedup_single_azure_call(client, fake_azure):
    resp = client.post(
        "/v1/translate",
        json={"texts": ["Salut", "Salut"], "target": "ar", "source": "fr"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert [t["cached"] for t in body["translations"]] == [False, False]
    assert len(fake_azure.calls) == 1
    assert fake_azure.calls[0] == ["Salut"]  # déduppliqué avant l'appel Azure


def test_translate_too_many_texts_returns_422(client):
    resp = client.post(
        "/v1/translate", json={"texts": ["x"] * 101, "target": "ar"}
    )
    assert resp.status_code == 422


def test_translate_invalid_target_returns_422(client):
    resp = client.post("/v1/translate", json={"texts": ["Bonjour"], "target": "en"})
    assert resp.status_code == 422


def test_translate_empty_texts_returns_422(client):
    resp = client.post("/v1/translate", json={"texts": [], "target": "ar"})
    assert resp.status_code == 422


def test_translate_over_char_budget_returns_422(client):
    resp = client.post(
        "/v1/translate", json={"texts": ["x" * 50_001], "target": "ar"}
    )
    assert resp.status_code == 422
