from app.main import _identity_from_claims, _parse_tenant_hosts, _resolve_tenant


def test_parse_tenant_hosts():
    mapping = _parse_tenant_hosts("m3a-l3achrane.ma=m3a-l3achrane, www.m3a-l3achrane.ma=m3a-l3achrane,bad=unknown")
    assert mapping == {"m3a-l3achrane.ma": "m3a-l3achrane",
                       "www.m3a-l3achrane.ma": "m3a-l3achrane"}  # tenant inconnu ignoré


def test_resolve_tenant_by_host(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "_TENANT_HOSTS", {"m3a-l3achrane.ma": "m3a-l3achrane"})
    monkeypatch.setattr(m.settings, "tenant_dev_header", False)
    assert _resolve_tenant({}, "m3a-l3achrane.ma:443") == "m3a-l3achrane"
    assert _resolve_tenant({}, "semsarout.ma") == "semsar"
    # En prod, l'en-tête x-tenant est IGNORÉ (anti-usurpation).
    assert _resolve_tenant({"x-tenant": "m3a-l3achrane"}, "semsarout.ma") == "semsar"


def test_resolve_tenant_dev_header(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "_TENANT_HOSTS", {})
    monkeypatch.setattr(m.settings, "tenant_dev_header", True)
    assert _resolve_tenant({"x-tenant": "m3a-l3achrane"}, "localhost:8099") == "m3a-l3achrane"
    assert _resolve_tenant({"x-tenant": "hack"}, "localhost:8099") == "semsar"  # inconnu → défaut
    assert _resolve_tenant({}, "localhost:8099") == "semsar"


def test_identity_claims_carry_tenant():
    ident = _identity_from_claims({"sub": "7", "account_role": "buyer", "tenant": "m3a-l3achrane"})
    assert ident["tenant"] == "m3a-l3achrane"
    assert _identity_from_claims({"sub": "7", "account_role": "buyer"})["tenant"] == "semsar"
