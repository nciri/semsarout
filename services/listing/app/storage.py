"""Stockage objet des médias (photos publiques, documents privés) — MinIO en dev, S3 en prod.

Remplace le disque `/uploads` du monolithe. Les photos sont servies via `GET /uploads/photos/{name}`
(flux depuis l'objet) ; les documents (PII) uniquement via `GET /documents/{id}` (authentifié).
"""
import os

from semsar_storage import ObjectStorage, s3_client

_store: ObjectStorage | None = None


def media() -> ObjectStorage:
    global _store
    if _store is None:
        client = s3_client(
            os.environ.get("S3_ENDPOINT_URL", "http://localhost:9000"),
            os.environ.get("S3_ACCESS_KEY", "semsar"),
            os.environ.get("S3_SECRET_KEY", "semsar-secret"),
        )
        _store = ObjectStorage(client, os.environ.get("MEDIA_BUCKET", "semsar-media"))
        _store.ensure_bucket()
    return _store


def exists(key: str) -> bool:
    try:
        media().get(key)
        return True
    except Exception:  # noqa: BLE001
        return False
