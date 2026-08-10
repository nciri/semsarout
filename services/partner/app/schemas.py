"""Schémas Pydantic des routes du service partner."""
from datetime import date

from pydantic import BaseModel, EmailStr, Field, field_validator

from . import net_guard

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
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
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


WEBHOOK_EVENTS = {
    "partner.affilie_created",
    "partner.verification_decided",
    "partner.reservation_created",
    "partner.reservation_released",
    "partner.grant_paid",
    "partner.invoice_sent",
    "partner.test",
}


def _validate_webhook_url(url: str) -> str:
    """Refuse tout ce qui permettrait à un partenaire de faire sonder le
    réseau interne du mesh ou les métadonnées cloud par le serveur (SSRF) :
    schéma non-https, hôtes loopback/privés/link-local (y compris les
    notations IPv4 alternatives — octal, hex, forme courte — que la libc
    résout), FQDN à point final, et hôtes internes (sans point, ou
    `localhost`). Pas de résolution DNS bloquante ici — voir `net_guard`
    pour le second rempart (résolution) appliqué juste avant la livraison
    réelle, seul rempart efficace contre le DNS-rebinding."""
    if net_guard.is_blocked_literal_url(url):
        raise ValueError("URL de webhook interdite (réseau interne)")
    return url


class WebhookCreateIn(BaseModel):
    url: str = Field(min_length=1, max_length=500)
    events: list[str] = Field(min_length=1)

    @field_validator("url")
    @classmethod
    def _url_no_ssrf(cls, v: str) -> str:
        return _validate_webhook_url(v)


class WebhookUpdateIn(BaseModel):
    url: str | None = Field(default=None, min_length=1, max_length=500)
    events: list[str] | None = None
    active: bool | None = None

    @field_validator("url")
    @classmethod
    def _url_no_ssrf(cls, v: str | None) -> str | None:
        return _validate_webhook_url(v) if v is not None else v
