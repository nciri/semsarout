import semsar_signing as signing


def test_signing_disabled_without_key(monkeypatch):
    monkeypatch.delenv("SIGN_API_KEY", raising=False)
    assert signing.signing_enabled() is False


def test_signing_enabled_with_key(monkeypatch):
    monkeypatch.setenv("SIGN_API_KEY", "secret-123")
    assert signing.signing_enabled() is True


def test_create_envelope_posts_and_returns_id(monkeypatch):
    monkeypatch.setenv("SIGN_API_KEY", "secret-123")
    captured = {}

    class _Resp:
        status_code = 200

        def json(self):
            return {"id": "env-42"}

    class _FakeClient:
        def __init__(self, *a, **k):
            captured["headers"] = k.get("headers")

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, path, json=None, **k):
            captured["path"] = path
            captured["json"] = json
            return _Resp()

    monkeypatch.setattr(signing.client, "httpx", type("m", (), {"Client": _FakeClient}))
    env_id = signing.create_envelope("Bail 123", "rental:lease:1:9")
    assert env_id == "env-42"
    assert captured["path"] == "/envelopes"
    assert captured["json"]["external_reference"] == "rental:lease:1:9"
    assert captured["headers"] == {"X-API-Key": "secret-123"}
