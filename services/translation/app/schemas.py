"""Schémas Pydantic — payload/réponse POST /v1/translate.

Les langues valides sont exprimées en `Literal` (pas en `field_validator` levant
`ValueError`) : le handler RFC 9457 du socle commun (`install_error_handlers`) sérialise
`RequestValidationError.errors()` en JSON, or pydantic v2 place l'exception Python brute
dans `ctx.error` pour les erreurs `value_error` — non sérialisable. `Literal` produit un
`literal_error` dont le `ctx` ne contient que des chaînes.
"""
from typing import Literal

from pydantic import BaseModel, Field

MAX_TEXTS = 100
MAX_TOTAL_CHARS = 50_000
Lang = Literal["fr", "ar"]


class TranslateRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=MAX_TEXTS)
    target: Lang
    source: Lang | None = None


class TranslationItem(BaseModel):
    source: str
    translated: str
    cached: bool


class TranslateResponse(BaseModel):
    translations: list[TranslationItem]
