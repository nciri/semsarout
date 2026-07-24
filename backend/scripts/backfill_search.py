"""Backfill de l'index OpenSearch `properties` depuis le monolithe (parité Stage 2).

Reproduit à l'identique le doc émis par l'outbox (`_property_doc` : `to_dict(include_images=True)`
+ `location` géo) pour que le `_source` indexé == la réponse `GET /properties` du monolithe.
À utiliser quand RabbitMQ/le worker ne tournent pas (bring-up, reconstruction).

    OPENSEARCH_URL=http://localhost:9200 python backend/scripts/backfill_search.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db  # noqa: E402
from app.models.property import Property  # noqa: E402
from semsar_search import ensure_index, index_property, os_client  # noqa: E402


def _property_doc(p: Property) -> dict:
    doc = p.to_dict(include_images=True)
    doc["location"] = {"lat": p.latitude, "lon": p.longitude} if p.latitude and p.longitude else None
    return doc


def main() -> int:
    url = os.environ.get("OPENSEARCH_URL", "http://localhost:9200")
    app = create_app(os.environ.get("FLASK_ENV", "development"))
    client = os_client(url)
    ensure_index(client)
    n = 0
    with app.app_context():
        for p in db.session.query(Property).yield_per(100):
            index_property(client, _property_doc(p))
            n += 1
    print(f"indexé {n} biens dans '{url}' (index 'properties')")
    return 0


if __name__ == "__main__":
    sys.exit(main())
