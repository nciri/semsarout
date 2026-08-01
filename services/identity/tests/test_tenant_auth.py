import jwt as pyjwt

_M3A = {"x-semsar-tenant": "m3a-l3achrane"}
_REG = {"email": "sara@ex.ma", "password": "secret123", "first_name": "Sara", "last_name": "K"}


def _decode(token: str) -> dict:
    return pyjwt.decode(token, "test-secret", algorithms=["HS256"])


def test_register_attaches_tenant_and_claim(client):
    r = client.post("/auth/register", json=_REG, headers=_M3A)
    assert r.status_code == 201
    assert r.json()["user"]["tenant"] == "m3a-l3achrane"
    assert _decode(r.json()["access_token"])["tenant"] == "m3a-l3achrane"
    assert _decode(r.json()["refresh_token"])["tenant"] == "m3a-l3achrane"


def test_register_default_tenant_semsar(client):
    r = client.post("/auth/register", json=_REG)
    assert r.status_code == 201
    assert r.json()["user"]["tenant"] == "semsar"
    assert _decode(r.json()["access_token"])["tenant"] == "semsar"


def test_same_email_registers_on_both_tenants(client):
    assert client.post("/auth/register", json=_REG).status_code == 201
    assert client.post("/auth/register", json=_REG, headers=_M3A).status_code == 201


def test_login_scoped_by_tenant(client):
    client.post("/auth/register", json=_REG, headers=_M3A)
    ok = client.post("/auth/login", json={"email": _REG["email"], "password": _REG["password"]},
                     headers=_M3A)
    assert ok.status_code == 200
    # Mêmes identifiants côté semsar : le compte n'existe pas sur ce tenant.
    ko = client.post("/auth/login", json={"email": _REG["email"], "password": _REG["password"]})
    assert ko.status_code == 401


def test_refresh_rejects_cross_tenant(client):
    reg = client.post("/auth/register", json=_REG, headers=_M3A)
    refresh_token = reg.json()["refresh_token"]
    ok = client.post("/auth/refresh", headers={"authorization": f"Bearer {refresh_token}", **_M3A})
    assert ok.status_code == 200
    assert _decode(ok.json()["access_token"])["tenant"] == "m3a-l3achrane"
    ko = client.post("/auth/refresh", headers={"authorization": f"Bearer {refresh_token}"})
    assert ko.status_code == 403
