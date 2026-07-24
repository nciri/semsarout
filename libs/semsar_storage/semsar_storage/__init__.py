"""Stockage objet partagé : S3/MinIO + archivage WORM."""
from .client import ObjectStorage, s3_client
from .worm import WormArchive

__all__ = ["s3_client", "ObjectStorage", "WormArchive"]
