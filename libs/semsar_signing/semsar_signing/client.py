"""Client 3a9dSign (signature électronique). Auth = en-tête X-API-Key (clé en env, jamais loggée)."""
import os
import sys


class SigningError(Exception):
    pass


def _base() -> str:
    return os.environ.get("SIGN_API_URL", "http://localhost:18000/api/v1").rstrip("/")


def _key() -> str:
    return os.environ.get("SIGN_API_KEY", "")


def signing_enabled() -> bool:
    return bool(_key())


def _headers() -> dict:
    return {"X-API-Key": _key()}


def _get_httpx():
    return sys.modules['semsar_signing'].httpx


def _client():
    httpx = _get_httpx()
    return httpx.Client(base_url=_base(), headers=_headers(), timeout=20.0)


def create_envelope(title: str, external_reference: str) -> str:
    with _client() as c:
        r = c.post("/envelopes", json={"title": title[:255], "routing_mode": "sequential",
                                       "external_reference": external_reference})
    if r.status_code >= 300:
        raise SigningError(f"create_envelope {r.status_code}")
    return r.json()["id"]


def add_document(env_id: str, filename: str, pdf_bytes: bytes):
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/documents",
                   files={"file": (filename, pdf_bytes, "application/pdf")})
    if r.status_code >= 300:
        raise SigningError(f"add_document {r.status_code}")
    d = r.json()
    return d["id"], int(d.get("page_count") or 1)


def add_recipient(env_id: str, email: str, name: str, routing_order: int) -> str:
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/recipients",
                   json={"email": email, "name": name, "role": "signer", "routing_order": routing_order})
    if r.status_code >= 300:
        raise SigningError(f"add_recipient {r.status_code}")
    return r.json()["id"]


def place_signature_field(env_id: str, document_id: str, recipient_id: str, page: int, x: float, y: float) -> None:
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/fields",
                   json={"document_id": document_id, "recipient_id": recipient_id,
                         "field_type": "signature", "page": page, "x": x, "y": y,
                         "width": 150, "height": 40, "required": True})
    if r.status_code >= 300:
        raise SigningError(f"place_field {r.status_code}")


def send_envelope(env_id: str) -> None:
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/send", json={"confirm": True})
    if r.status_code >= 300:
        raise SigningError(f"send {r.status_code}")


def get_status(env_id: str) -> str:
    with _client() as c:
        r = c.get(f"/envelopes/{env_id}")
    if r.status_code >= 300:
        raise SigningError(f"get_status {r.status_code}")
    return r.json().get("status", "")


def fetch_signed_pdf(env_id: str, document_id: str) -> bytes:
    httpx = _get_httpx()
    with _client() as c:
        r = c.get(f"/envelopes/{env_id}/documents/{document_id}/download")
        if r.status_code >= 300:
            raise SigningError(f"download {r.status_code}")
        url = r.json()["url"]
        url = url.replace("http://minio:9000", os.environ.get("S3_ENDPOINT_URL", "http://localhost:9000"))
        rr = httpx.get(url, timeout=30.0)
    if rr.status_code >= 300:
        raise SigningError(f"download_bytes {rr.status_code}")
    return rr.content
