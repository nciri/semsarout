"""Index OpenSearch des annonces de colocation M3a-L3achrane (projection reconstructible).

Alimenté par coloc.listing_published, purgé par coloc.listing_status_changed
(nouveau statut ≠ PUBLIEE). _id = listing_id → idempotent.
"""
from typing import Any

COLOC_INDEX = "coloc_listings"

COLOC_MAPPING: dict[str, Any] = {
    "mappings": {
        "properties": {
            "listing_id": {"type": "keyword"},
            "title": {"type": "text"},
            "description": {"type": "text"},
            "city": {"type": "keyword"},
            "neighborhood": {"type": "keyword"},
            "property_type": {"type": "keyword"},
            "bed_type": {"type": "keyword"},
            "housing_gender": {"type": "keyword"},
            "furnished": {"type": "boolean"},
            "rent": {"type": "double"},
            "currency": {"type": "keyword"},
            "capacity": {"type": "integer"},
            "available_from": {"type": "date"},
            "published_at": {"type": "date"},
            "media_urls": {"type": "keyword"},
            "rules": {"type": "keyword"},
            "amenities": {"type": "keyword"},
            "status": {"type": "keyword"},
            "is_condo": {"type": "boolean"},
            "condo_fees": {"type": "double"},
            "text": {"type": "text", "analyzer": "standard"},
        }
    }
}

_SORTS: dict[str, list[Any]] = {
    "relevance": ["_score", {"published_at": "desc"}],
    "rent_asc": [{"rent": "asc"}],
    "rent_desc": [{"rent": "desc"}],
    "recent": [{"published_at": "desc"}],
}

# Le front parle en « type d'offre » (chambre|studio|residence) — traduction
# vers les champs du domaine (bed_type/property_type).
_KIND_FILTERS: dict[str, dict[str, Any]] = {
    "chambre": {"terms": {"bed_type": ["CHAMBRE_INDIVIDUELLE", "CHAMBRE_PARTAGEE"]}},
    "studio": {"bool": {"should": [
        {"term": {"property_type": "STUDIO"}},
        {"term": {"bed_type": "STUDIO_ENTIER"}},
    ], "minimum_should_match": 1}},
    "residence": {"term": {"property_type": "RESIDENCE_ETUDIANTE"}},
}


def ensure_coloc_index(client) -> None:
    if not client.indices.exists(index=COLOC_INDEX):
        client.indices.create(index=COLOC_INDEX, body=COLOC_MAPPING)


def _index_doc(doc: dict) -> dict:
    d = dict(doc)
    d["text"] = " ".join(str(part) for part in (
        doc.get("title"), doc.get("description"), doc.get("city"), doc.get("neighborhood"),
    ) if part)
    return d


def index_coloc_listing(client, doc: dict) -> None:
    client.index(index=COLOC_INDEX, id=str(doc["listing_id"]), body=_index_doc(doc), refresh=True)


def delete_coloc_listing(client, listing_id) -> None:
    client.delete(index=COLOC_INDEX, id=str(listing_id), ignore=[404])


def build_coloc_query(*, city: str | None = None, neighborhood: str | None = None,
                      housing_gender: str | None = None, kind: str | None = None,
                      min_rent: float | None = None, max_rent: float | None = None,
                      q: str | None = None, sort: str = "relevance",
                      limit: int = 20, offset: int = 0) -> dict:
    filters: list[dict[str, Any]] = [{"term": {"status": "PUBLIEE"}}]
    if city:
        filters.append({"term": {"city": city}})
    if neighborhood:
        filters.append({"term": {"neighborhood": neighborhood}})
    if housing_gender:
        filters.append({"term": {"housing_gender": housing_gender}})
    if kind in _KIND_FILTERS:
        filters.append(_KIND_FILTERS[kind])
    rent_range: dict[str, float] = {}
    if min_rent is not None:
        rent_range["gte"] = float(min_rent)
    if max_rent is not None:
        rent_range["lte"] = float(max_rent)
    if rent_range:
        filters.append({"range": {"rent": rent_range}})
    must: list[dict[str, Any]] = []
    if q:
        must.append({"match": {"text": q}})
    return {
        "size": limit, "from": offset,
        "query": {"bool": {"must": must or [{"match_all": {}}], "filter": filters}},
        "sort": _SORTS.get(sort, _SORTS["relevance"]),
    }


def search_coloc(client, **criteria) -> dict:
    resp = client.search(index=COLOC_INDEX, body=build_coloc_query(**criteria))
    hits = resp.get("hits", {})
    total = hits.get("total", {})
    return {
        "total": total.get("value", 0) if isinstance(total, dict) else int(total or 0),
        "items": [h["_source"] for h in hits.get("hits", [])],
    }
