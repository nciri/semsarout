"""Transformations pures sur le document géométrie (miroir de frontend/src/utils/floorplan.js)."""
import math


def _pt(p: dict, f: float) -> dict:
    return {"x": p["x"] * f, "y": p["y"] * f}


def rescale(geometry: dict, factor: float) -> dict:
    """Remet à l'échelle positions/longueurs (recalibration). Épaisseurs, largeurs d'ouverture,
    hauteurs et allèges sont des dimensions réelles saisies : elles ne changent pas."""
    return {
        "walls": [{**w, "a": _pt(w["a"], factor), "b": _pt(w["b"], factor)} for w in geometry.get("walls", [])],
        "rooms": [{**r, "polygon": [_pt(p, factor) for p in r["polygon"]]} for r in geometry.get("rooms", [])],
        "openings": [{**o, "offset_m": o["offset_m"] * factor} for o in geometry.get("openings", [])],
    }


def _dist_norm(a: dict, b: dict) -> float:
    return math.hypot(b["x"] - a["x"], b["y"] - a["y"])


def calibration_scale(old: dict | None, new: dict) -> float:
    """Facteur à appliquer à une géométrie calibrée avec `old` pour l'exprimer avec `new`.

    Forme générale (pas seulement le même segment retracé) : le facteur est le rapport des
    échelles mètres/unité-normalisée. Sans ancienne calibration, ou segment dégénéré (distance
    normalisée nulle) → 1.0 (pas de division par zéro, pas de déformation).
    """
    if not old:
        return 1.0
    old_dist = _dist_norm(old["p1"], old["p2"])
    new_dist = _dist_norm(new["p1"], new["p2"])
    if old_dist <= 0 or new_dist <= 0:
        return 1.0
    old_scale = float(old["meters"]) / old_dist
    new_scale = float(new["meters"]) / new_dist
    return new_scale / old_scale
