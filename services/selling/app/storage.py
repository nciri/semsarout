"""Stockage objet (MinIO/S3) des pièces de vente (compromis signés)."""
import os

from semsar_common import get_settings
from semsar_storage import ObjectStorage, s3_client


def docs_storage() -> ObjectStorage:
    s = get_settings()
    client = s3_client(s.s3_endpoint, s.s3_access_key, s.s3_secret_key)
    store = ObjectStorage(client, os.environ.get("SELLING_DOCS_BUCKET", "semsar-selling-docs"))
    store.ensure_bucket()
    return store
