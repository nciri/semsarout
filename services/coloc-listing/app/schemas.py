"""Payloads API — portés de m3a-l3achrane (schemas.py), enums validés ici."""
from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator

from .models import BED_TYPES, HOUSING_GENDERS, MEDIA_TYPES, PROPERTY_TYPES


def _validate(value: str, allowed: set[str], label: str) -> str:
    if value not in allowed:
        raise ValueError(f"{label} invalide : {value}")
    return value


class PropertyIn(BaseModel):
    city: str = Field(min_length=1, max_length=80)
    neighborhood: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=300)
    property_type: str
    floor: int | None = None
    area_m2: int | None = Field(default=None, ge=1)
    amenities: dict[str, Any] = Field(default_factory=dict)

    @field_validator("property_type")
    @classmethod
    def _pt(cls, v: str) -> str:
        return _validate(v, PROPERTY_TYPES, "property_type")


class ListingCreateIn(BaseModel):
    property: PropertyIn
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    bed_type: str
    rent: Decimal = Field(gt=0)
    charges_included: bool = False
    charges_amount: Decimal | None = None
    deposit: Decimal | None = None
    currency: str = Field(default="MAD", min_length=3, max_length=3)
    furnished: bool = False
    housing_gender: str
    capacity: int = Field(default=1, ge=1, le=8)
    available_from: date | None = None
    duration_min_months: int | None = Field(default=None, ge=0)
    duration_max_months: int | None = Field(default=None, ge=0)

    @field_validator("bed_type")
    @classmethod
    def _bt(cls, v: str) -> str:
        return _validate(v, BED_TYPES, "bed_type")

    @field_validator("housing_gender")
    @classmethod
    def _hg(cls, v: str) -> str:
        return _validate(v, HOUSING_GENDERS, "housing_gender")


class ListingUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    bed_type: str | None = None
    rent: Decimal | None = Field(default=None, gt=0)
    charges_included: bool | None = None
    charges_amount: Decimal | None = None
    deposit: Decimal | None = None
    furnished: bool | None = None
    capacity: int | None = Field(default=None, ge=1, le=8)
    available_from: date | None = None
    duration_min_months: int | None = Field(default=None, ge=0)
    duration_max_months: int | None = Field(default=None, ge=0)

    @field_validator("bed_type")
    @classmethod
    def _bt(cls, v: str | None) -> str | None:
        return v if v is None else _validate(v, BED_TYPES, "bed_type")


class HouseRuleIn(BaseModel):
    code: str = Field(max_length=40)
    value: str = Field(max_length=120)

    @field_validator("value")
    @classmethod
    def _known(cls, v: str, info):
        # La validation croisée code+valeur se fait dans la route (erreur legacy 400).
        return v


class HouseRulesIn(BaseModel):
    rules: list[HouseRuleIn]


class RoommatesIn(BaseModel):
    total: int = Field(ge=0, le=20)
    women: int = Field(ge=0, le=20)
    men: int = Field(ge=0, le=20)
    statuses: dict[str, Any] = Field(default_factory=dict)


class MediaIn(BaseModel):
    url: str = Field(max_length=500)
    position: int = Field(default=0, ge=0)
    media_type: str

    @field_validator("media_type")
    @classmethod
    def _mt(cls, v: str) -> str:
        return _validate(v, MEDIA_TYPES, "media_type")
