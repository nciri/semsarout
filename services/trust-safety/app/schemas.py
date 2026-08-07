"""Payloads API du domaine reports — enums validés ici (parité coloc-listing/schemas.py)."""
from pydantic import BaseModel, Field, field_validator

from .models import REPORT_REASONS, TARGET_TYPES


class ReportCreateIn(BaseModel):
    target_type: str
    target_id: str = Field(min_length=1, max_length=64)
    reason: str
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("target_type")
    @classmethod
    def _target_type(cls, v: str) -> str:
        if v not in TARGET_TYPES:
            raise ValueError(f"target_type invalide : {v}")
        return v

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        if v not in REPORT_REASONS:
            raise ValueError(f"reason invalide : {v}")
        return v
