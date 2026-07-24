"""Index OpenSearch des biens — projection reconstructible depuis les événements
`listing.*`. Ce n'est JAMAIS la source de vérité (celle-ci reste PostgreSQL)."""
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
            "city": {"type": "keyword"},
            "transaction_type": {"type": "keyword"},  # sale | rent
            "property_type": {"type": "keyword"},
            "status": {"type": "keyword"},
            "price": {"type": "double"},
            "bedrooms": {"type": "integer"},
            "area": {"type": "double"},
            "agency_id": {"type": "long"},
            "location": {"type": "geo_point"},
        }
    }
}


def os_client(url: str) -> OpenSearch:
    return OpenSearch(hosts=[url], http_compress=True)


def ensure_index(client: OpenSearch) -> None:
    if not client.indices.exists(PROPERTY_INDEX):
        client.indices.create(PROPERTY_INDEX, body=MAPPING)


def index_property(client: OpenSearch, doc: dict) -> None:
    client.index(index=PROPERTY_INDEX, id=str(doc["id"]), body=doc, refresh=True)


def delete_property(client: OpenSearch, property_id: int | str) -> None:
    client.delete(index=PROPERTY_INDEX, id=str(property_id), ignore=[404])


def search_properties(client: OpenSearch, *, q: str | None = None, filters: dict | None = None,
                      page: int = 1, per_page: int = 20) -> dict:
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
        "page": page,
        "per_page": per_page,
    }
