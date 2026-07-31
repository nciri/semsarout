"""Client 3a9dSign partagé (transport pur ; la logique métier reste dans chaque service)."""
import httpx

from .client import (
    SigningError,
    add_document,
    add_recipient,
    create_envelope,
    fetch_signed_pdf,
    get_status,
    place_signature_field,
    send_envelope,
    signing_enabled,
)

__all__ = [
    "SigningError",
    "signing_enabled",
    "create_envelope",
    "add_document",
    "add_recipient",
    "place_signature_field",
    "send_envelope",
    "get_status",
    "fetch_signed_pdf",
]
