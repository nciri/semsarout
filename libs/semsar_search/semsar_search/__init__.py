"""Projection de recherche OpenSearch."""
from .index import (
    PROPERTY_INDEX,
    delete_property,
    ensure_index,
    index_property,
    os_client,
    search_properties,
)

__all__ = [
    "PROPERTY_INDEX",
    "os_client",
    "ensure_index",
    "index_property",
    "delete_property",
    "search_properties",
]
