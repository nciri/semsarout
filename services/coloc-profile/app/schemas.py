"""Payloads API coloc-profile — référentiel lifestyle partagé (semsar_common)."""
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class ProfileIn(BaseModel):
    """Mise à jour partielle (exclude_unset) — validations métier dans la route."""

    gender: str | None = None
    birth_date: date | None = None
    city: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=2000)
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    move_in_date: date | None = None


class LifestyleAnswerIn(BaseModel):
    question_code: str = Field(max_length=40)
    value: str = Field(max_length=60)
    importance: str = "PREFERENCE"


class LifestyleAnswersIn(BaseModel):
    answers: list[LifestyleAnswerIn]


class FavoriteIn(BaseModel):
    listing_id: str = Field(min_length=1, max_length=32)
