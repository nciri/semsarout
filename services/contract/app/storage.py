"""Stockage objet (MinIO/S3) des PDF de contrats finalisés — valeur probante.

Le PDF finalisé est écrit dans le bucket objet du service ; l'endpoint `/pdf` le relit et le
diffuse. Remplace l'écriture sur disque local du monolithe (respecte l'archi v2 : stockage objet).
"""
import os

from semsar_common import get_settings
from semsar_storage import ObjectStorage, s3_client


def pdf_storage() -> ObjectStorage:
    s = get_settings()
    client = s3_client(s.s3_endpoint, s.s3_access_key, s.s3_secret_key)
    store = ObjectStorage(client, s.worm_bucket)
    store.ensure_bucket()
    return store


def template_storage() -> ObjectStorage:
    """Modèles déposés par les agences (Word/PDF). Bucket distinct du WORM des contrats
    finalisés : un modèle se remplace et se supprime, un acte signé jamais."""
    s = get_settings()
    client = s3_client(s.s3_endpoint, s.s3_access_key, s.s3_secret_key)
    store = ObjectStorage(client, os.environ.get("CONTRACT_TEMPLATES_BUCKET",
                                                 "semsar-contract-templates"))
    store.ensure_bucket()
    return store
