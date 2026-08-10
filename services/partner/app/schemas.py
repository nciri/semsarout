"""Schémas Pydantic des routes du service partner."""
from datetime import date

from pydantic import BaseModel, EmailStr, Field

AFFILIE_STATUSES = {"PENDING", "ACTIVE", "INACTIVE"}
VERIFICATION_DOC_TYPES = {"CIN", "CARTE_ETUDIANT", "ATTESTATION_EMPLOYEUR", "AUTRE"}
RESERVATION_STATUSES = {"RESERVED", "RELEASED", "CONVERTED"}
GRANT_STATUSES = {"PLANNED", "PAID", "CANCELLED"}
INVOICE_STATUSES = {"DRAFT", "SENT", "PAID", "OVERDUE"}


class AffilieCreateIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    external_ref: str | None = Field(default=None, max_length=80)


class AffilieUpdateIn(BaseModel):
    full_name: str | None = None
    status: str | None = None  # validé contre AFFILIE_STATUSES dans la route


class VerificationCreateIn(BaseModel):
    affilie_id: str
    doc_type: str  # validé contre VERIFICATION_DOC_TYPES dans la route
    note: str | None = Field(default=None, max_length=500)


class ReservationCreateIn(BaseModel):
    listing_id: str
    affilie_id: str | None = None
    label: str = Field(min_length=1, max_length=160)
    start_date: date
    end_date: date


class GrantCreateIn(BaseModel):
    program: str = Field(min_length=1, max_length=160)
    affilie_id: str | None = None
    amount: float = Field(gt=0)
    currency: str = Field(default="MAD", min_length=3, max_length=3)


class GrantUpdateIn(BaseModel):
    status: str  # validé contre GRANT_STATUSES dans la route


class InvoiceCreateIn(BaseModel):
    number: str = Field(min_length=1, max_length=60)
    period: str = Field(min_length=7, max_length=7)
    amount: float = Field(gt=0)
    currency: str = Field(default="MAD", min_length=3, max_length=3)


class InvoiceUpdateIn(BaseModel):
    status: str  # validé contre INVOICE_STATUSES dans la route


class ApiKeyCreateIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
