"""Fabrique l'archiveur WORM à partir de la config commune (MinIO/S3)."""
from semsar_common import get_settings
from semsar_storage import WormArchive, s3_client


def worm_archive() -> WormArchive:
    s = get_settings()
    client = s3_client(s.s3_endpoint, s.s3_access_key, s.s3_secret_key)
    return WormArchive(client, s.worm_bucket)
