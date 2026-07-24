"""Projection de recherche OpenSearch."""
from .index import (
    PROPERTY_INDEX,
    build_query,
    delete_property,
    ensure_index,
    index_property,
    os_client,
    search_listings,
    search_properties,
    suggest,
)

__all__ = [
    "PROPERTY_INDEX",
    "os_client",
    "ensure_index",
    "index_property",
    "delete_property",
    "search_properties",
    "search_listings",
    "build_query",
    "suggest",
]
