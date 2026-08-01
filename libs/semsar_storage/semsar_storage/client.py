"""Client de stockage objet S3-compatible (MinIO en dev, S3 en prod)."""
from typing import Any

import boto3
from botocore.config import Config


def s3_client(
    endpoint_url: str,
    access_key: str,
    secret_key: str,
    region: str = "us-east-1",
) -> Any:
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        config=Config(signature_version="s3v4"),
    )


class ObjectStorage:
    """Opérations objet de base : médias publics, documents authentifiés."""

    def __init__(self, client: Any, bucket: str) -> None:
        self._c = client
        self._bucket = bucket

    def ensure_bucket(self, object_lock: bool = False) -> None:
        try:
            self._c.head_bucket(Bucket=self._bucket)
            return
        except Exception:  # noqa: BLE001 — bucket absent → on le crée
            pass
        kwargs: dict[str, Any] = {"Bucket": self._bucket}
        if object_lock:
            kwargs["ObjectLockEnabledForBucket"] = True
        self._c.create_bucket(**kwargs)

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream", **extra: Any) -> None:
        self._c.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type, **extra)

    def get(self, key: str) -> bytes:
        return self._c.get_object(Bucket=self._bucket, Key=key)["Body"].read()

    def presigned_url(self, key: str, expires: int = 3600) -> str:
        return self._c.generate_presigned_url(
            "get_object", Params={"Bucket": self._bucket, "Key": key}, ExpiresIn=expires
        )
