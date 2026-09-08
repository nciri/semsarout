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
