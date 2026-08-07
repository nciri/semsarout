from types import SimpleNamespace

import app.main as m
from app.main import _resolve_upstream


def _app(**states):
    return SimpleNamespace(state=SimpleNamespace(**states))


def test_conversations_list_routes_to_messaging(monkeypatch):
    monkeypatch.setattr(m.settings, "messaging_url", "http://msg")
    fake = _app(messaging="MESSAGING")
    assert _resolve_upstream(fake, "/api/v1/conversations", "GET") == (
        "MESSAGING", "/messaging/conversations")


def test_conversations_create_routes_to_messaging(monkeypatch):
    monkeypatch.setattr(m.settings, "messaging_url", "http://msg")
    fake = _app(messaging="MESSAGING")
    assert _resolve_upstream(fake, "/api/v1/conversations", "POST") == (
        "MESSAGING", "/messaging/conversations")


def test_conversation_messages_route_to_messaging(monkeypatch):
    monkeypatch.setattr(m.settings, "messaging_url", "http://msg")
    fake = _app(messaging="MESSAGING")
    assert _resolve_upstream(fake, "/api/v1/conversations/42/messages", "POST") == (
        "MESSAGING", "/messaging/conversations/42/messages")


def test_conversation_read_routes_to_messaging(monkeypatch):
    monkeypatch.setattr(m.settings, "messaging_url", "http://msg")
    fake = _app(messaging="MESSAGING")
    assert _resolve_upstream(fake, "/api/v1/conversations/42/read", "POST") == (
        "MESSAGING", "/messaging/conversations/42/read")


def test_notifications_list_routes_to_messaging(monkeypatch):
    monkeypatch.setattr(m.settings, "messaging_url", "http://msg")
    fake = _app(messaging="MESSAGING")
    assert _resolve_upstream(fake, "/api/v1/notifications", "GET") == (
        "MESSAGING", "/messaging/notifications")


def test_notifications_unread_count_routes_to_messaging(monkeypatch):
    monkeypatch.setattr(m.settings, "messaging_url", "http://msg")
    fake = _app(messaging="MESSAGING")
    assert _resolve_upstream(fake, "/api/v1/notifications/unread-count", "GET") == (
        "MESSAGING", "/messaging/notifications/unread-count")


def test_notifications_read_all_routes_to_messaging(monkeypatch):
    monkeypatch.setattr(m.settings, "messaging_url", "http://msg")
    fake = _app(messaging="MESSAGING")
    assert _resolve_upstream(fake, "/api/v1/notifications/read-all", "POST") == (
        "MESSAGING", "/messaging/notifications/read-all")


def test_notification_mark_read_routes_to_messaging(monkeypatch):
    monkeypatch.setattr(m.settings, "messaging_url", "http://msg")
    fake = _app(messaging="MESSAGING")
    assert _resolve_upstream(fake, "/api/v1/notifications/7/read", "POST") == (
        "MESSAGING", "/messaging/notifications/7/read")


def test_conversations_unmapped_when_messaging_disabled(monkeypatch):
    monkeypatch.setattr(m.settings, "messaging_url", None)
    fake = _app(messaging=None)
    client, _ = _resolve_upstream(fake, "/api/v1/conversations", "GET")
    assert client is None
    client, _ = _resolve_upstream(fake, "/api/v1/notifications", "GET")
    assert client is None


def test_legacy_messaging_prefix_still_routes(monkeypatch):
    """La route générique legacy `/api/v1/messaging/*` (semsar) reste servie sans collision
    avec les nouvelles routes composites `/api/v1/conversations` et `/api/v1/notifications`."""
    monkeypatch.setattr(m.settings, "messaging_url", "http://msg")
    fake = _app(messaging="MESSAGING")
    assert _resolve_upstream(fake, "/api/v1/messaging/conversations", "GET") == (
        "MESSAGING", "/messaging/conversations")
