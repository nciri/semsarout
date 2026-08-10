"""Schémas Pydantic des routes du service partner."""
from pydantic import BaseModel, EmailStr, Field

AFFILIE_STATUSES = {"PENDING", "ACTIVE", "INACTIVE"}


class AffilieCreateIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    external_ref: str | None = Field(default=None, max_length=80)


class AffilieUpdateIn(BaseModel):
    full_name: str | None = None
    status: str | None = None  # validé contre AFFILIE_STATUSES dans la route
