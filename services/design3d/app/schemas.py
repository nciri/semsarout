"""Payloads API + validation du document `geometry` (miroir côté client : frontend/src/utils/floorplan.js)."""
import json
import math

from pydantic import BaseModel, Field, field_validator

from .models import OPENING_TYPES, PROJECT_STATUSES, ROOM_TYPES, TARGET_TYPES

MAX_GEOMETRY_BYTES = 512 * 1024


def wall_length(wall: dict) -> float:
    a, b = wall["a"], wall["b"]
    return math.hypot(b["x"] - a["x"], b["y"] - a["y"])


def _is_point(p) -> bool:
    return isinstance(p, dict) and all(isinstance(p.get(k), (int, float)) for k in ("x", "y"))


def validate_geometry(geometry: dict, wall_height_m: float) -> list[str]:
    errors: list[str] = []
    if not isinstance(geometry, dict):
        return ["geometry doit être un objet"]
    if len(json.dumps(geometry, separators=(",", ":"))) > MAX_GEOMETRY_BYTES:
        errors.append("geometry dépasse 512 Ko")
    walls = geometry.get("walls") or []
    rooms = geometry.get("rooms") or []
    openings = geometry.get("openings") or []
    for coll, name in ((walls, "walls"), (rooms, "rooms"), (openings, "openings")):
        ids = [e.get("id") for e in coll if isinstance(e, dict)]
        if len(ids) != len(set(ids)) or any(not i for i in ids):
            errors.append(f"{name}: identifiants manquants ou en double")
    by_id = {}
    for w in walls:
        if not (_is_point(w.get("a")) and _is_point(w.get("b"))) or wall_length(w) <= 0:
            errors.append(f"mur {w.get('id')}: deux points distincts requis")
            continue
        t = w.get("thickness_m")
        if not isinstance(t, (int, float)) or not (0 < t <= 1):
            errors.append(f"mur {w.get('id')}: thickness_m dans ]0, 1]")
        by_id[w["id"]] = w
    for r in rooms:
        poly = r.get("polygon") or []
        if len(poly) < 3 or not all(_is_point(p) for p in poly):
            errors.append(f"pièce {r.get('id')}: polygone ≥ 3 points")
        if r.get("type") not in ROOM_TYPES:
            errors.append(f"pièce {r.get('id')}: type inconnu")
    for o in openings:
        if o.get("type") not in OPENING_TYPES:
            errors.append(f"ouverture {o.get('id')}: type inconnu")
        w = by_id.get(o.get("wall_id"))
        if w is None:
            errors.append(f"ouverture {o.get('id')}: mur introuvable")
            continue
        off, wd, h, sill = (o.get(k, 0) for k in ("offset_m", "width_m", "height_m", "sill_m"))
        if not all(isinstance(v, (int, float)) for v in (off, wd, h, sill)) or wd <= 0 or off < 0:
            errors.append(f"ouverture {o.get('id')}: dimensions invalides")
            continue
        if off + wd > wall_length(w) + 1e-6:
            errors.append(f"ouverture {o.get('id')}: dépasse le mur")
        if sill + h > float(wall_height_m) + 1e-6:
            errors.append(f"ouverture {o.get('id')}: dépasse la hauteur du mur")
    return errors


class ProjectCreateIn(BaseModel):
    id: str | None = Field(default=None, min_length=32, max_length=32)
    target_type: str
    target_id: int
    title: str = Field(min_length=1, max_length=200)

    @field_validator("target_type")
    @classmethod
    def _tt(cls, v):
        if v not in TARGET_TYPES:
            raise ValueError("target_type invalide")
        return v


class ProjectUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: str | None = None

    @field_validator("status")
    @classmethod
    def _st(cls, v):
        if v is not None and v not in PROJECT_STATUSES:
            raise ValueError("status invalide")
        return v


class CalibrationIn(BaseModel):
    p1: dict
    p2: dict
    meters: float = Field(gt=0)


class LevelCreateIn(BaseModel):
    id: str | None = Field(default=None, min_length=32, max_length=32)
    name: str = Field(min_length=1, max_length=60)
    position: int = 0


class LevelUpdateIn(BaseModel):
    base_revision: int
    name: str | None = Field(default=None, min_length=1, max_length=60)
    position: int | None = None
    wall_height_m: float | None = Field(default=None, gt=1.5, le=6)
    calibration: CalibrationIn | None = None
    geometry: dict | None = None
    show_background_public: bool | None = None
