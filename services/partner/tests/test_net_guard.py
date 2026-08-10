"""Garde-fou SSRF partagé (`app/net_guard.py`) : vérification littérale (à la
validation, sans DNS) et vérification à la livraison (avec résolution —
seul rempart réel contre le DNS-rebinding)."""
import socket

from app import net_guard


def test_literal_blocks_alternate_ipv4_notations():
    for url in (
        "https://127.1/x",
        "https://0177.0.0.1/x",
        "https://0x7f.0.0.1/x",
        "https://169.254.169.254./x",
        "http://example.org/x",
        "https://localhost/x",
        "https://internal/x",
    ):
        assert net_guard.is_blocked_literal_url(url), url


def test_literal_allows_public_https_hostname():
    assert not net_guard.is_blocked_literal_url("https://hooks.example.com/x")


def test_resolve_blocks_dns_rebinding_to_private_ip(monkeypatch):
    """Un hôte public en apparence (accepté à la validation) qui résout
    vers une IP privée au moment de la livraison doit être bloqué — c'est
    le scénario que la vérification littérale seule ne peut pas couvrir."""
    assert not net_guard.is_blocked_literal_url("https://rebind.example.com/x")

    def fake_getaddrinfo(host, port, **kw):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    assert net_guard.is_blocked_url("https://rebind.example.com/x")


def test_resolve_allows_hostname_resolving_to_public_ip(monkeypatch):
    def fake_getaddrinfo(host, port, **kw):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    assert not net_guard.is_blocked_url("https://hooks.example.com/x")


def test_resolve_fails_closed_on_dns_error(monkeypatch):
    def fake_getaddrinfo(host, port, **kw):
        raise socket.gaierror("no such host")

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    assert net_guard.is_blocked_url("https://does-not-resolve.example.com/x")


def test_http_post_never_calls_httpx_when_delivery_guard_blocks(monkeypatch):
    """Le vrai `_http_post` de `app/main.py` doit refuser de poster (sans
    même essayer) quand le garde-fou de livraison bloque l'hôte résolu —
    c'est la défense en profondeur contre le DNS-rebinding."""
    import app.main as main_module

    def fake_getaddrinfo(host, port, **kw):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    called = []
    monkeypatch.setattr(main_module.httpx, "post",
                         lambda *a, **k: called.append(1) or None)

    status = main_module._http_post("https://rebind.example.com/x", b"{}", {})
    assert status == 599
    assert called == []  # httpx.post jamais appelé
