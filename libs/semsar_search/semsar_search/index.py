"""Index OpenSearch des biens — projection reconstructible depuis `listing.*`.

Stage 2 : couvre la **découverte** du monolithe (77 filtres de `GET /properties`,
`POST /properties/search`, `/suggestions`). Le document indexé est le **to_dict complet**
du bien (renvoyé tel quel → parité des réponses). Ce n'est jamais la source de vérité.

⚠️ Parité : les filtres range/term/in sont exacts ; les filtres texte (`ilike` substring),
`features` (contains JSON) et géo (bounding-box) utilisent des équivalents OpenSearch
**documentés** à vérifier par tests de contrat.
"""
import math
from typing import Any

from opensearchpy import OpenSearch

PROPERTY_INDEX = "properties"

MAPPING: dict[str, Any] = {
    "mappings": {
        "properties": {
            "id": {"type": "long"},
            "reference": {"type": "keyword"},
            "title": {"type": "text"},
            "description": {"type": "text"},
            "property_type": {"type": "keyword"},
            "transaction_type": {"type": "keyword"},
            "status": {"type": "keyword"},
            "price": {"type": "double"},
            "surface": {"type": "double"},
            "land_surface": {"type": "double"},
            "rooms": {"type": "integer"},
            "bedrooms": {"type": "integer"},
            "bathrooms": {"type": "integer"},
            "floor": {"type": "integer"},
            "total_floors": {"type": "integer"},
            "construction_year": {"type": "integer"},
            "energy_class": {"type": "keyword"},
            "features": {"type": "keyword"},
            "city": {"type": "keyword"},
            "neighborhood": {"type": "keyword"},
            "address": {"type": "text"},
            "agency_id": {"type": "long"},
            "owner_id": {"type": "long"},
            "is_featured": {"type": "boolean"},
            "is_urgent": {"type": "boolean"},
            "is_premium": {"type": "boolean"},
            "has_images": {"type": "boolean"},
            "latitude": {"type": "double"},
            "longitude": {"type": "double"},
            "location": {"type": "geo_point"},
            "published_at": {"type": "date"},
            "created_at": {"type": "date"},
        }
    }
}

# Postgres trie DESC → NULLS FIRST, ASC → NULLS LAST : on aligne le placement des NULL.
_PUB_DESC = {"published_at": {"order": "desc", "missing": "_first"}}
_PUB_ASC = {"published_at": {"order": "asc", "missing": "_last"}}
_FEAT = {"is_featured": "desc"}
_URG = {"is_urgent": "desc"}
_ID = {"id": "desc"}  # départage déterministe (pagination stable, parité des ex æquo)

_SORTS = {
    "newest": [_PUB_DESC],
    "oldest": [_PUB_ASC],
    "price_asc": [{"price": "asc"}],
    "price_desc": [{"price": "desc"}],
    "surface_asc": [{"surface": "asc"}],
    "surface_desc": [{"surface": "desc"}],
    "rooms_asc": [{"rooms": "asc"}],
    "rooms_desc": [{"rooms": "desc"}],
}

# Profil « search » (POST /properties/search) : tri distinct du monolithe — défaut
# `relevance` (featured d'abord, puis récent), sans secondaire is_urgent.
_SEARCH_SORTS = {
    "relevance": [_FEAT, _PUB_DESC],
    "newest": [_PUB_DESC],
    "price_asc": [{"price": "asc"}],
    "price_desc": [{"price": "desc"}],
}


def _resolve_sort(criteria: dict) -> list[dict]:
    """Reproduit l'ORDER BY du monolithe selon l'endpoint (profil) et le mode de tri.
    Ajoute `id desc` en départage pour une pagination déterministe (parité)."""
    if criteria.get("sort_profile") == "search":
        base = _SEARCH_SORTS.get(criteria.get("sort") or "relevance", _SEARCH_SORTS["relevance"])
        return [*base, _ID]
    # profil « list » (GET /properties) : primaire + featured/urgent (toujours appendus).
    base = _SORTS.get(criteria.get("sort", "newest"), _SORTS["newest"])
    return [*base, _FEAT, _URG, _ID]


def os_client(url: str) -> OpenSearch:
    return OpenSearch(hosts=[url], http_compress=True)


def ensure_index(client: OpenSearch) -> None:
    if not client.indices.exists(index=PROPERTY_INDEX):
        client.indices.create(index=PROPERTY_INDEX, body=MAPPING)


def _index_doc(doc: dict) -> dict:
    """Enrichit le doc à indexer avec les champs dérivés utiles aux filtres."""
    d = dict(doc)
    loc = doc.get("location")
    if loc and loc.get("lat") is not None and loc.get("lon") is not None:
        d["latitude"] = loc["lat"]
        d["longitude"] = loc["lon"]
    d["has_images"] = bool(doc.get("images"))
    return d


def index_property(client: OpenSearch, doc: dict) -> None:
    client.index(index=PROPERTY_INDEX, id=str(doc["id"]), body=_index_doc(doc), refresh=True)


def delete_property(client: OpenSearch, property_id) -> None:
    client.delete(index=PROPERTY_INDEX, id=str(property_id), ignore=[404])


def _rng(field: str, gte=None, lte=None) -> dict | None:
    body = {}
    if gte is not None:
        body["gte"] = gte
    if lte is not None:
        body["lte"] = lte
    return {"range": {field: body}} if body else None


def _substr(field: str, value: str) -> dict:
    # Équivalent de `ILIKE %value%` : wildcard insensible à la casse (à vérifier).
    return {"wildcard": {field: {"value": f"*{value}*", "case_insensitive": True}}}


def build_query(criteria: dict, hidden_users: list[int], hidden_agencies: list[int]) -> dict:
    """Traduit les critères (normalisés) en requête OpenSearch (public : status=active)."""
    must: list[dict] = [{"term": {"status": "active"}}]
    should_or: list[list[dict]] = []  # groupes OR (villes, quartiers, q)
    must_not: list[dict] = []

    if hidden_users:
        must_not.append({"terms": {"owner_id": hidden_users}})
    if hidden_agencies:
        must_not.append({"terms": {"agency_id": hidden_agencies}})

    if criteria.get("transaction_type"):
        must.append({"term": {"transaction_type": criteria["transaction_type"]}})
    if criteria.get("property_types"):
        must.append({"terms": {"property_type": criteria["property_types"]}})
    if criteria.get("energy_classes"):
        must.append({"terms": {"energy_class": criteria["energy_classes"]}})

    # Villes / quartiers : OR de substrings
    if criteria.get("cities"):
        should_or.append([_substr("city", c) for c in criteria["cities"]])
    if criteria.get("neighborhoods"):
        should_or.append([_substr("neighborhood", n) for n in criteria["neighborhoods"]])

    for field, lo, hi in (
        ("price", "min_price", "max_price"),
        ("surface", "min_surface", "max_surface"),
        ("land_surface", "min_land_surface", "max_land_surface"),
        ("rooms", "min_rooms", "max_rooms"),
        ("bedrooms", "min_bedrooms", "max_bedrooms"),
        ("floor", "min_floor", "max_floor"),
        ("construction_year", "min_construction_year", "max_construction_year"),
    ):
        r = _rng(field, criteria.get(lo), criteria.get(hi))
        if r:
            must.append(r)
    if criteria.get("min_bathrooms") is not None:
        must.append({"range": {"bathrooms": {"gte": criteria["min_bathrooms"]}}})

    if criteria.get("ground_floor"):
        must.append({"term": {"floor": 0}})
    if criteria.get("last_floor"):
        # `floor == total_floors` : comparaison inter-champs → script (parité approx.)
        must.append({"script": {"script": "doc['floor'].size()>0 && doc['total_floors'].size()>0 "
                                           "&& doc['floor'].value==doc['total_floors'].value"}})

    if criteria.get("agency_id") is not None:
        must.append({"term": {"agency_id": criteria["agency_id"]}})
    if criteria.get("owner_type") == "agency":
        must.append({"exists": {"field": "agency_id"}})
    elif criteria.get("owner_type") == "particular":
        must_not.append({"exists": {"field": "agency_id"}})

    if criteria.get("features"):
        # `contains` JSON insensible à la casse ~ term par feature (AND). À vérifier (casse).
        for f in criteria["features"]:
            must.append({"term": {"features": f}})

    if criteria.get("is_featured"):
        must.append({"term": {"is_featured": True}})
    if criteria.get("is_urgent"):
        must.append({"term": {"is_urgent": True}})
    if criteria.get("has_photos"):
        must.append({"term": {"has_images": True}})

    geo = criteria.get("geo")
    if geo and geo.get("lat") is not None and geo.get("lng") is not None and geo.get("radius"):
        lat, lng, radius = geo["lat"], geo["lng"], geo["radius"]
        lat_delta = radius / 111.0
        cos_lat = max(abs(math.cos(math.radians(lat))), 0.01)
        lng_delta = radius / (111.0 * cos_lat)
        must.append({"range": {"latitude": {"gte": lat - lat_delta, "lte": lat + lat_delta}}})
        must.append({"range": {"longitude": {"gte": lng - lng_delta, "lte": lng + lng_delta}}})

    if criteria.get("q"):
        term = criteria["q"]
        should_or.append([
            {"match_phrase_prefix": {"title": term}},
            {"match_phrase_prefix": {"description": term}},
            _substr("city", term), _substr("neighborhood", term), {"match_phrase_prefix": {"address": term}},
        ])

    bool_query: dict[str, Any] = {"must": must}
    if must_not:
        bool_query["must_not"] = must_not
    # Chaque groupe OR devient un bloc bool.should minimum_should_match=1 dans must.
    for group in should_or:
        must.append({"bool": {"should": group, "minimum_should_match": 1}})

    sort = _resolve_sort(criteria)
    # `location`/`has_images` sont dérivés pour l'indexation (filtres géo/photos) mais
    # absents du `to_dict()` du monolithe → exclus de la réponse pour la parité.
    return {"query": {"bool": bool_query}, "sort": sort,
            "_source": {"excludes": ["location", "has_images"]}}


def search_listings(client: OpenSearch, criteria: dict, hidden_users=None, hidden_agencies=None) -> dict:
    page = max(1, int(criteria.get("page", 1) or 1))
    per_page = min(100, max(1, int(criteria.get("per_page", 20) or 20)))
    body = build_query(criteria, hidden_users or [], hidden_agencies or [])
    body["from"] = (page - 1) * per_page
    body["size"] = per_page
    res = client.search(index=PROPERTY_INDEX, body=body)
    hits = res.get("hits", {})
    total = hits.get("total", {}).get("value", 0)
    pages = math.ceil(total / per_page) if per_page else 1
    return {
        "properties": [h["_source"] for h in hits.get("hits", [])],
        "total": total, "pages": pages, "current_page": page, "per_page": per_page,
        "has_next": page < pages, "has_prev": page > 1,
    }


def search_properties(client: OpenSearch, *, q: str | None = None, filters: dict | None = None,
                      page: int = 1, per_page: int = 20) -> dict:
    """Recherche simple (endpoint /search/properties) — conservée pour compat."""
    must: list[dict] = []
    if q:
        must.append({"multi_match": {"query": q, "fields": ["title^2", "description", "city"]}})
    for field, value in (filters or {}).items():
        if value is not None and value != "":
            must.append({"term": {field: value}})
    body = {
        "query": {"bool": {"must": must or [{"match_all": {}}]}},
        "from": max(0, (page - 1) * per_page),
        "size": per_page,
    }
    res = client.search(index=PROPERTY_INDEX, body=body)
    hits = res.get("hits", {})
    return {
        "total": hits.get("total", {}).get("value", 0),
        "results": [h["_source"] for h in hits.get("hits", [])],
        "page": page, "per_page": per_page,
    }


def suggest(client: OpenSearch, q: str) -> list[dict]:
    """Suggestions ville + quartier (biens actifs), à l'image du monolithe."""
    if not q or len(q) < 2:
        return []
    out: list[dict] = []
    for field, label in (("city", "city"), ("neighborhood", "neighborhood")):
        body = {
            "size": 0,
            "query": {"bool": {"must": [{"term": {"status": "active"}}, _substr(field, q)]}},
            "aggs": {"vals": {"terms": {"field": field, "size": 5}}},
        }
        res = client.search(index=PROPERTY_INDEX, body=body)
        for b in res.get("aggregations", {}).get("vals", {}).get("buckets", []):
            if b["key"]:
                out.append({"type": label, "value": b["key"]})
    return out[:10]
