from sqlalchemy.exc import IntegrityError

from app.models import TranslationCache, hash_source


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


# --- Fix round 1 : FINDING 1 (race IntegrityError -> row introuvable) ---


def test_translate_unresolved_integrity_conflict_returns_controlled_500(
    client, db_session, monkeypatch
):
    """Si `db.flush()` lève IntegrityError et que la relecture qui suit ne retrouve
    aucune ligne (conflit signalé mais rien à lire — cas dégénéré), le service doit
    renvoyer une erreur maîtrisée (Problem 500), jamais un AttributeError sur un `row`
    resté `None`."""

    def _boom():
        raise IntegrityError("INSERT", {}, Exception("duplicate key"))

    monkeypatch.setattr(db_session, "flush", _boom)

    resp = client.post(
        "/v1/translate", json={"texts": ["Bonjour"], "target": "ar", "source": "fr"}
    )
    assert resp.status_code == 500
    assert resp.json()["status"] == 500


# --- Fix round 1 : FINDING 2 (lookup sans `source` ignorait source_lang) ---


def test_translate_no_source_ambiguous_cache_is_not_cross_contaminated(
    client, db_session, fake_azure
):
    """Deux entrées de cache pour le même (hash, target) mais des `source_lang`
    différentes : sans `source` explicite dans la requête, impossible de savoir
    laquelle s'applique -> pas de hit, on retraduit plutôt que de renvoyer la
    traduction de la mauvaise langue source.

    Les deux `source_lang` pré-seedées (`ar`/`es`) sont volontairement différentes de
    celle que `FakeAzureClient` détecte pour ce lot (`fr`, cf. conftest) : le nouveau
    résultat s'insère donc sans reprendre par accident une des deux lignes ambiguës via
    le chemin de retry IntegrityError (couvert séparément par le test du FINDING 1)."""
    h = hash_source("Salam")
    db_session.add_all(
        [
            TranslationCache(
                source_hash=h, source_lang="ar", target_lang="ar",
                source_text="Salam", translated_text="depuis-ar",
            ),
            TranslationCache(
                source_hash=h, source_lang="es", target_lang="ar",
                source_text="Salam", translated_text="depuis-es",
            ),
        ]
    )
    db_session.commit()

    resp = client.post("/v1/translate", json={"texts": ["Salam"], "target": "ar"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["translations"][0]["cached"] is False
    assert body["translations"][0]["translated"] not in ("depuis-ar", "depuis-es")
    assert len(fake_azure.calls) == 1


def test_translate_no_source_unambiguous_cache_is_hit(client, db_session, fake_azure):
    """Un seul `source_lang` connu pour ce (hash, target) sans ambiguïté -> hit valide,
    aucun appel Azure."""
    h = hash_source("Salam")
    db_session.add(
        TranslationCache(
            source_hash=h, source_lang="fr", target_lang="ar",
            source_text="Salam", translated_text="depuis-fr",
        )
    )
    db_session.commit()

    resp = client.post("/v1/translate", json={"texts": ["Salam"], "target": "ar"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["translations"][0] == {
        "source": "Salam", "translated": "depuis-fr", "cached": True
    }
    assert len(fake_azure.calls) == 0
