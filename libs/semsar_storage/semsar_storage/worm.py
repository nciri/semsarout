"""Archivage WORM (Write-Once-Read-Many) via S3 Object Lock, mode COMPLIANCE.

Pour la valeur probante des **contrats** et **dossiers juridiques/notaires** : un objet
archivé ne peut être ni modifié ni supprimé avant l'échéance de rétention, y compris par
un administrateur. Le bucket doit être créé avec Object Lock activé (`setup()`).
"""
from datetime import datetime, timedelta, timezone
from typing import Any

from .client import ObjectStorage


class WormArchive(ObjectStorage):
    def setup(self) -> None:
        """Crée le bucket avec Object Lock activé (à faire une fois)."""
        self.ensure_bucket(object_lock=True)

    def archive(
        self,
        key: str,
        data: bytes,
        retain_days: int = 3650,
        content_type: str = "application/pdf",
    ) -> str:
        """Écrit un objet immuable jusqu'à `retain_days` jours. Renvoie la clé."""
        retain_until = datetime.now(timezone.utc) + timedelta(days=retain_days)
        self.put(
            key,
            data,
            content_type=content_type,
            ObjectLockMode="COMPLIANCE",
            ObjectLockRetainUntilDate=retain_until,
        )
        return key

    def retention(self, key: str) -> dict[str, Any]:
        """Renvoie l'état de rétention Object Lock d'un objet archivé."""
        return self._c.get_object_retention(Bucket=self._bucket, Key=key).get("Retention", {})
