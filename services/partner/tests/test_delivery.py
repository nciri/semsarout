import hashlib
import hmac

from app.delivery import deliver, sign


def test_sign_hmac():
    assert sign("s3cr3t", b"body") == "sha256=" + hmac.new(b"s3cr3t", b"body", hashlib.sha256).hexdigest()


def test_deliver_retries_then_fails():
    calls = []

    def post(url, data, headers):  # simule 500 puis 500 puis 500
        calls.append(headers["X-Partner-Signature"])
        return 500

    res = deliver({"url": "http://x", "secret": "s"}, "partner.test", {"a": 1}, post=post, max_attempts=3)
    assert res.status == "FAILED" and res.attempts == 3
    assert all(sig.startswith("sha256=") for sig in calls)


def test_deliver_succeeds_first_try():
    def post(url, data, headers):
        return 200

    res = deliver({"url": "http://x", "secret": "s"}, "partner.test", {"a": 1}, post=post, max_attempts=3)
    assert res.status == "DELIVERED" and res.attempts == 1


def test_deliver_no_sleep_call_when_last_attempt_reached():
    sleeps = []

    def post(url, data, headers):
        return 500

    def sleep(attempt):
        sleeps.append(attempt)

    deliver({"url": "http://x", "secret": "s"}, "partner.test", {"a": 1}, post=post, max_attempts=3, sleep=sleep)
    assert sleeps == [1, 2]  # jamais après la dernière tentative


def test_deliver_headers_include_event_type():
    seen = {}

    def post(url, data, headers):
        seen.update(headers)
        return 200

    deliver({"url": "http://x", "secret": "s"}, "partner.grant_paid", {"a": 1}, post=post, max_attempts=3)
    assert seen["X-Partner-Event"] == "partner.grant_paid"
