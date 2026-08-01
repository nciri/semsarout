from app.coloc_index import _index_doc, build_coloc_query


DOC = {"listing_id": "abc", "title": "Chambre à Gauthier", "description": "Belle",
       "city": "Casablanca", "neighborhood": "Gauthier", "property_type": "APPARTEMENT",
       "bed_type": "CHAMBRE_INDIVIDUELLE", "housing_gender": "FEMININ", "furnished": True,
       "rent": 2200.0, "currency": "MAD", "capacity": 3, "available_from": None,
       "published_at": "2026-08-01T12:00:00+00:00", "media_urls": [], "rules": ["Non-fumeur"],
       "amenities": ["wifi"], "status": "PUBLIEE"}


def test_index_doc_builds_fulltext():
    d = _index_doc(DOC)
    assert "Chambre à Gauthier" in d["text"] and "Casablanca" in d["text"]
    assert d["listing_id"] == "abc"


def _filters(query):
    return query["query"]["bool"]["filter"]


def test_query_defaults_published_only():
    q = build_coloc_query()
    assert {"term": {"status": "PUBLIEE"}} in _filters(q)
    assert q["size"] == 20 and q["from"] == 0


def test_query_filters():
    q = build_coloc_query(city="Casablanca", housing_gender="FEMININ",
                          min_rent=1000, max_rent=3000, kind="chambre")
    f = _filters(q)
    assert {"term": {"city": "Casablanca"}} in f
    assert {"term": {"housing_gender": "FEMININ"}} in f
    assert {"range": {"rent": {"gte": 1000.0, "lte": 3000.0}}} in f
    assert {"terms": {"bed_type": ["CHAMBRE_INDIVIDUELLE", "CHAMBRE_PARTAGEE"]}} in f


def test_query_kind_studio_and_residence():
    assert {"bool": {"should": [
        {"term": {"property_type": "STUDIO"}},
        {"term": {"bed_type": "STUDIO_ENTIER"}},
    ], "minimum_should_match": 1}} in _filters(build_coloc_query(kind="studio"))
    assert {"term": {"property_type": "RESIDENCE_ETUDIANTE"}} in _filters(
        build_coloc_query(kind="residence"))


def test_query_sorts():
    assert build_coloc_query(sort="rent_asc")["sort"] == [{"rent": "asc"}]
    assert build_coloc_query(sort="recent")["sort"] == [{"published_at": "desc"}]
    assert build_coloc_query(sort="relevance")["sort"] == ["_score", {"published_at": "desc"}]


def test_query_fulltext():
    q = build_coloc_query(q="gauthier")
    assert q["query"]["bool"]["must"] == [{"match": {"text": "gauthier"}}]
