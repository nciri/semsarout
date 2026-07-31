import app.commission_client as cc


def test_gate_raises_on_network_error(monkeypatch):
    def boom(*a, **k):
        raise cc.httpx.HTTPError("down")
    monkeypatch.setattr(cc.httpx, "get", boom)
    try:
        cc.gate(5, "rental", 1)
        assert False, "doit lever"
    except cc.CommissionUnavailable:
        pass


def test_gate_returns_json(monkeypatch):
    class _R:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {"state": "OPEN", "billable": False}
    monkeypatch.setattr(cc.httpx, "get", lambda *a, **k: _R())
    assert cc.gate(5, "rental", 1)["state"] == "OPEN"
