"""Stockage objet des plans (images de fond des niveaux) — MinIO en dev, S3 en prod."""
import os

from semsar_storage import ObjectStorage, s3_client

_store: ObjectStorage | None = None


def plans() -> ObjectStorage:
    global _store
    if _store is None:
        client = s3_client(
            os.environ.get("S3_ENDPOINT_URL", "http://localhost:9000"),
            os.environ.get("S3_ACCESS_KEY", "semsar"),
            os.environ.get("S3_SECRET_KEY", "semsar-secret"),
        )
        _store = ObjectStorage(client, os.environ.get("DESIGN_PLANS_BUCKET", "semsar-design-plans"))
        _store.ensure_bucket()
    return _store
