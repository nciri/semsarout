"""Stockage objet (MinIO/S3) des photos des rapports de ménage."""
import os

from semsar_common import get_settings
from semsar_storage import ObjectStorage, s3_client


def photos_storage() -> ObjectStorage:
    s = get_settings()
    client = s3_client(s.s3_endpoint, s.s3_access_key, s.s3_secret_key)
    store = ObjectStorage(client, os.environ.get("STAYMANAGER_PHOTOS_BUCKET", "semsar-sejours-photos"))
    store.ensure_bucket()
    return store
