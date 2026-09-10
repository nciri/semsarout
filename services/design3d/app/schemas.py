"""Payloads API + validation du document `geometry` (miroir côté client : frontend/src/utils/floorplan.js)."""
import json
import math

from pydantic import BaseModel, Field, field_validator

from .models import OPENING_TYPES, PROJECT_STATUSES, ROOM_TYPES, TARGET_TYPES

MAX_GEOMETRY_BYTES = 512 * 1024


def wall_length(wall: dict) -> float:
    a, b = wall["a"], wall["b"]
    return math.hypot(b["x"] - a["x"], b["y"] - a["y"])


def _is_finite_number(v) -> bool:
    """Vérifier que v est un nombre fini (pas bool, NaN, ou Infinity)."""
    if isinstance(v, bool):
        return False
    if not isinstance(v, (int, float)):
        return False
    return math.isfinite(v)


def _is_point(p) -> bool:
    """Vérifier qu'un point est un dict avec coordonnées x, y finies."""
    return isinstance(p, dict) and all(_is_finite_number(p.get(k)) for k in ("x", "y"))


def validate_geometry(geometry: dict, wall_height_m: float) -> list[str]:
    errors: list[str] = []
    if not isinstance(geometry, dict):
        return ["geometry doit être un objet"]
    if len(json.dumps(geometry, separators=(",", ":"))) > MAX_GEOMETRY_BYTES:
        errors.append("geometry dépasse 512 Ko")

    # Vérifier que wall_height_m est fini
    if not _is_finite_number(wall_height_m):
        errors.append("wall_height_m invalide")
        return errors

    # Vérifier et récupérer les collections (doivent être des listes)
    walls_raw = geometry.get("walls")
    rooms_raw = geometry.get("rooms")
    openings_raw = geometry.get("openings")

    if walls_raw is not None and not isinstance(walls_raw, list):
        errors.append("walls: liste attendue")
        walls = []
    else:
        walls = walls_raw or []

    if rooms_raw is not None and not isinstance(rooms_raw, list):
        errors.append("rooms: liste attendue")
        rooms = []
    else:
        rooms = rooms_raw or []

    if openings_raw is not None and not isinstance(openings_raw, list):
        errors.append("openings: liste attendue")
        openings = []
    else:
        openings = openings_raw or []

    # Vérifier identifiants manquants/vides/dupliqués pour chaque collection
    for coll, name in ((walls, "walls"), (rooms, "rooms"), (openings, "openings")):
        ids = []
        for idx, e in enumerate(coll):
            if not isinstance(e, dict):
                errors.append(f"{name}[{idx}]: objet attendu")
                continue
            e_id = e.get("id")
            if not e_id:
                errors.append(f"{name}: identifiants manquants ou en double")
                break
            ids.append(e_id)
        if ids and len(ids) != len(set(ids)):
            errors.append(f"{name}: identifiants manquants ou en double")

    by_id = {}
    for idx, w in enumerate(walls):
        if not isinstance(w, dict):
            # Erreur déjà enregistrée ci-dessus
            continue

        w_id = w.get("id")
        a = w.get("a")
        b = w.get("b")

        if not (_is_point(a) and _is_point(b)):
            errors.append(f"mur {w_id}: deux points distincts requis")
            continue

        try:
            wlen = wall_length(w)
            if wlen <= 0:
                errors.append(f"mur {w_id}: deux points distincts requis")
                continue
        except (ValueError, TypeError):
            errors.append(f"mur {w_id}: deux points distincts requis")
            continue

        t = w.get("thickness_m")
        if not _is_finite_number(t) or not (0 < t <= 1):
            errors.append(f"mur {w_id}: thickness_m dans ]0, 1]")

        by_id[w_id] = w

    for idx, r in enumerate(rooms):
        if not isinstance(r, dict):
            # Erreur déjà enregistrée ci-dessus
            continue

        r_id = r.get("id")
        poly = r.get("polygon") or []

        if len(poly) < 3 or not all(_is_point(p) for p in poly):
            errors.append(f"pièce {r_id}: polygone ≥ 3 points")

        if r.get("type") not in ROOM_TYPES:
            errors.append(f"pièce {r_id}: type inconnu")

    for idx, o in enumerate(openings):
        if not isinstance(o, dict):
            # Erreur déjà enregistrée ci-dessus
            continue

        o_id = o.get("id")
        o_type = o.get("type")

        if o_type not in OPENING_TYPES:
            errors.append(f"ouverture {o_id}: type inconnu")

        wall_id = o.get("wall_id")
        w = by_id.get(wall_id)
        if w is None:
            errors.append(f"ouverture {o_id}: mur introuvable")
            continue

        off = o.get("offset_m", 0)
        wd = o.get("width_m", 0)
        h = o.get("height_m", 0)
        sill = o.get("sill_m", 0)

        # Vérifier que les dimensions sont des nombres finis
        if not all(_is_finite_number(v) for v in (off, wd, h, sill)):
            errors.append(f"ouverture {o_id}: dimensions invalides")
            continue

        if wd <= 0 or off < 0:
            errors.append(f"ouverture {o_id}: dimensions invalides")
            continue

        try:
            wlen = wall_length(w)
            if off + wd > wlen + 1e-6:
                errors.append(f"ouverture {o_id}: dépasse le mur")
        except (ValueError, TypeError):
            errors.append(f"ouverture {o_id}: dépasse le mur")

        if sill + h > float(wall_height_m) + 1e-6:
            errors.append(f"ouverture {o_id}: dépasse la hauteur du mur")

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


class PointIn(BaseModel):
    """Point de calibration en coordonnées normalisées (0-1, relatives à l'image).

    Typé, et non `dict` : un `{"p1": {}, "p2": {}}` traversait sinon la validation
    et faisait remonter un `KeyError` en 500 au premier calcul d'échelle. La forme
    sérialisée par `model_dump()` est inchangée (`{"x": …, "y": …}`).
    """
    x: float
    y: float


class CalibrationIn(BaseModel):
    p1: PointIn
    p2: PointIn
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
