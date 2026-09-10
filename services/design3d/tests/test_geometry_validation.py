from app.schemas import validate_geometry, wall_length

W = {"id": "w1", "a": {"x": 0, "y": 0}, "b": {"x": 4, "y": 0}, "thickness_m": 0.2}


def _g(**k):
    g = {"walls": [W], "rooms": [], "openings": []}
    g.update(k)
    return g


def test_valid_minimal():
    assert validate_geometry(_g(), 2.7) == []


def test_wall_length():
    assert wall_length({"a": {"x": 0, "y": 0}, "b": {"x": 3, "y": 4}}) == 5


def test_degenerate_wall_rejected():
    g = _g(walls=[{**W, "b": {"x": 0, "y": 0}}])
    assert any("w1" in e for e in validate_geometry(g, 2.7))


def test_thickness_bounds():
    assert validate_geometry(_g(walls=[{**W, "thickness_m": 0}]), 2.7)
    assert validate_geometry(_g(walls=[{**W, "thickness_m": 1.5}]), 2.7)


def test_room_needs_three_points():
    g = _g(rooms=[{"id": "r1", "type": "living", "name": "S", "polygon": [{"x": 0, "y": 0}, {"x": 1, "y": 0}]}])
    assert validate_geometry(g, 2.7)


def test_room_type_must_be_known():
    g = _g(rooms=[{"id": "r1", "type": "spa", "name": "S",
                   "polygon": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}]}])
    assert validate_geometry(g, 2.7)


def test_opening_orphan_rejected():
    g = _g(openings=[{"id": "o1", "wall_id": "nope", "type": "door", "offset_m": 0, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}])
    assert validate_geometry(g, 2.7)


def test_opening_beyond_wall_rejected():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": 3.5, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}])
    assert validate_geometry(g, 2.7)


def test_opening_taller_than_wall_rejected():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "window", "offset_m": 1, "width_m": 1.2, "height_m": 2, "sill_m": 1}])
    assert validate_geometry(g, 2.7)


def test_duplicate_ids_rejected():
    assert validate_geometry(_g(walls=[W, {**W}]), 2.7)


def test_oversized_document_rejected():
    big = _g(walls=[{**W, "id": f"w{i}"} for i in range(20000)])
    assert any("512" in e for e in validate_geometry(big, 2.7))


# Mineurs — règles existantes non testées
def test_geometry_must_be_dict():
    assert validate_geometry("not a dict", 2.7)


def test_opening_type_invalid():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "porthole", "offset_m": 0, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}])
    assert any("o1" in e and "type" in e for e in validate_geometry(g, 2.7))


def test_opening_dimensions_nonnumeric():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": "zero", "width_m": 0.9, "height_m": 2.1, "sill_m": 0}])
    assert any("o1" in e for e in validate_geometry(g, 2.7))


def test_opening_width_must_be_positive():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": 0, "width_m": 0, "height_m": 2.1, "sill_m": 0}])
    assert any("o1" in e for e in validate_geometry(g, 2.7))


def test_opening_offset_must_be_nonnegative():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": -1, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}])
    assert any("o1" in e for e in validate_geometry(g, 2.7))


def test_duplicate_room_ids_rejected():
    r = {"id": "r1", "type": "living", "name": "S", "polygon": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}]}
    g = _g(rooms=[r, {**r}])
    assert any("rooms" in e and "double" in e for e in validate_geometry(g, 2.7))


def test_duplicate_opening_ids_rejected():
    o = {"id": "o1", "wall_id": "w1", "type": "door", "offset_m": 0, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}
    g = _g(openings=[o, {**o}])
    assert any("openings" in e and "double" in e for e in validate_geometry(g, 2.7))


def test_missing_wall_id_rejected():
    g = _g(walls=[{**W, "id": ""}])
    assert any("walls" in e and ("double" in e or "vide" in e or "manquant" in e) for e in validate_geometry(g, 2.7))


def test_missing_room_id_rejected():
    r = {"id": "", "type": "living", "name": "S", "polygon": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}]}
    g = _g(rooms=[r])
    assert any("rooms" in e and ("double" in e or "vide" in e or "manquant" in e) for e in validate_geometry(g, 2.7))


def test_missing_opening_id_rejected():
    o = {"id": "", "wall_id": "w1", "type": "door", "offset_m": 0, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}
    g = _g(openings=[o])
    assert any("openings" in e and ("double" in e or "vide" in e or "manquant" in e) for e in validate_geometry(g, 2.7))


# Importants — structures malformées et NaN/Infinity
def test_walls_not_a_list():
    g = {"walls": "not a list", "rooms": [], "openings": []}
    assert any("walls" in e and ("liste" in e or "list" in e) for e in validate_geometry(g, 2.7))


def test_rooms_not_a_list():
    g = {"walls": [W], "rooms": "not a list", "openings": []}
    assert any("rooms" in e and ("liste" in e or "list" in e) for e in validate_geometry(g, 2.7))


def test_openings_not_a_list():
    g = {"walls": [W], "rooms": [], "openings": "not a list"}
    assert any("openings" in e and ("liste" in e or "list" in e) for e in validate_geometry(g, 2.7))


def test_wall_element_not_dict():
    g = _g(walls=[W, None])
    assert any("walls" in e and ("objet" in e or "dict" in e) for e in validate_geometry(g, 2.7))


def test_room_element_not_dict():
    r = {"id": "r1", "type": "living", "name": "S", "polygon": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}]}
    g = _g(rooms=[r, 42])
    assert any("rooms" in e and ("objet" in e or "dict" in e) for e in validate_geometry(g, 2.7))


def test_opening_element_not_dict():
    o = {"id": "o1", "wall_id": "w1", "type": "door", "offset_m": 0, "width_m": 0.9, "height_m": 2.1, "sill_m": 0}
    g = _g(openings=[o, None])
    assert any("openings" in e and ("objet" in e or "dict" in e) for e in validate_geometry(g, 2.7))


def test_wall_point_coordinate_nan():
    g = _g(walls=[{**W, "a": {"x": float("nan"), "y": 0}}])
    assert any("w1" in e for e in validate_geometry(g, 2.7))


def test_wall_point_coordinate_inf():
    g = _g(walls=[{**W, "b": {"x": float("inf"), "y": 0}}])
    assert any("w1" in e for e in validate_geometry(g, 2.7))


def test_wall_thickness_nan():
    g = _g(walls=[{**W, "thickness_m": float("nan")}])
    assert any("w1" in e for e in validate_geometry(g, 2.7))


def test_wall_thickness_inf():
    g = _g(walls=[{**W, "thickness_m": float("inf")}])
    assert any("w1" in e for e in validate_geometry(g, 2.7))


def test_opening_offset_nan():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": float("nan"), "width_m": 0.9, "height_m": 2.1, "sill_m": 0}])
    assert any("o1" in e for e in validate_geometry(g, 2.7))


def test_opening_width_nan():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "door", "offset_m": 0, "width_m": float("nan"), "height_m": 2.1, "sill_m": 0}])
    assert any("o1" in e for e in validate_geometry(g, 2.7))


def test_opening_height_inf():
    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "window", "offset_m": 1, "width_m": 1.2, "height_m": float("inf"), "sill_m": 0}])
    assert any("o1" in e for e in validate_geometry(g, 2.7))


def test_room_polygon_point_nan():
    g = _g(rooms=[{"id": "r1", "type": "living", "name": "S", "polygon": [{"x": 0, "y": 0}, {"x": 1, "y": float("nan")}, {"x": 1, "y": 1}]}])
    assert any("r1" in e for e in validate_geometry(g, 2.7))


def test_bool_not_accepted_as_number():
    # bool is instance of int in Python, but should not be accepted as a valid number
    g = _g(walls=[{**W, "thickness_m": True}])
    assert any("w1" in e for e in validate_geometry(g, 2.7))


def test_rescale_ne_leve_pas_sur_des_cles_absentes():
    """B3 : `rescale` indexait `o["offset_m"]`, `w["a"]` et `r["polygon"]` directement.

    Une ouverture sans `offset_m` traverse pourtant `validate_geometry` (qui la
    fait défaut à 0) et se retrouve donc en base : la recalibration du niveau
    remontait alors un `KeyError` en 500. Une entrée incomplète est laissée
    telle quelle — mettre à l'échelle une valeur absente reviendrait à inventer
    de la géométrie.
    """
    from app.geometry import rescale

    g = rescale({"walls": [{"id": "w1"}, {"id": "w2", "a": {"x": 1, "y": 2}}],
                 "rooms": [{"id": "r1"}],
                 "openings": [{"id": "o1", "wall_id": "w1"}, {"id": "o2", "offset_m": 1}]}, 2)
    assert g["walls"][0] == {"id": "w1"}
    assert g["walls"][1]["a"] == {"x": 2, "y": 4} and "b" not in g["walls"][1]
    assert g["rooms"][0] == {"id": "r1"}
    assert g["openings"][0] == {"id": "o1", "wall_id": "w1"}
    assert g["openings"][1]["offset_m"] == 2


def test_rescale_accepte_une_ouverture_sans_offset_conservee_en_base():
    """L'ouverture sans `offset_m` est acceptée par la validation : rescale doit tenir."""
    from app.geometry import rescale
    from app.schemas import validate_geometry

    g = _g(openings=[{"id": "o1", "wall_id": "w1", "type": "door", "width_m": 0.9, "height_m": 2.1, "sill_m": 0}])
    assert validate_geometry(g, 2.7) == []
    assert rescale(g, 0.5)["walls"][0]["b"] == {"x": 2, "y": 0}
