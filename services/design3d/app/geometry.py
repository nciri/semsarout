"""Transformations pures sur le document géométrie (miroir de frontend/src/utils/floorplan.js)."""
import math


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _pt(p, f: float):
    """Un point incomplet est renvoyé tel quel.

    L'indexation directe faisait remonter un `KeyError` en 500 sur une entrée
    partielle — et une ouverture sans `offset_m`, par exemple, traverse
    `validate_geometry` (qui la fait défaut à 0) : la géométrie stockée peut donc
    légitimement en contenir. Mettre à l'échelle une coordonnée absente
    reviendrait à inventer de la géométrie.
    """
    if not isinstance(p, dict) or not (_num(p.get("x")) and _num(p.get("y"))):
        return p
    return {"x": p["x"] * f, "y": p["y"] * f}


def _scaled_wall(w, f: float):
    if not isinstance(w, dict):
        return w
    return {**w, **{k: _pt(w[k], f) for k in ("a", "b") if k in w}}


def _scaled_room(r, f: float):
    if not isinstance(r, dict) or not isinstance(r.get("polygon"), list):
        return r
    return {**r, "polygon": [_pt(p, f) for p in r["polygon"]]}


def _scaled_opening(o, f: float):
    if not isinstance(o, dict) or not _num(o.get("offset_m")):
        return o
    return {**o, "offset_m": o["offset_m"] * f}


def rescale(geometry: dict, factor: float) -> dict:
    """Remet à l'échelle positions/longueurs (recalibration). Épaisseurs, largeurs d'ouverture,
    hauteurs et allèges sont des dimensions réelles saisies : elles ne changent pas."""
    return {
        "walls": [_scaled_wall(w, factor) for w in geometry.get("walls") or []],
        "rooms": [_scaled_room(r, factor) for r in geometry.get("rooms") or []],
        "openings": [_scaled_opening(o, factor) for o in geometry.get("openings") or []],
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
