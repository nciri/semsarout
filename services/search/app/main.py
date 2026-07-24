"""Service search — API de lecture (requêtes sur la projection OpenSearch).

Recherche publique (annonces publiques), sans auth — comme la recherche du site.
Le BFF route `/api/v1/search/*` ici ; l'indexation est faite par le worker.
"""
from fastapi import FastAPI, Query, Request
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_common import get_settings, install_error_handlers, setup_logging, setup_tracing
from semsar_search import ensure_index, os_client, search_listings, search_properties, suggest

from . import moderation

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

app = FastAPI(title=f"SemsarOut — {settings.service_name}")
install_error_handlers(app)

try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

_client = os_client(settings.opensearch_url)


@app.on_event("startup")
def _startup() -> None:
    try:
        ensure_index(_client)
    except Exception:  # noqa: BLE001 — OpenSearch peut ne pas être prêt au boot
        pass


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


def _num(v, cast):
    try:
        return cast(v)
    except (TypeError, ValueError):
        return None


def _criteria_from_query(qp) -> dict:
    g = qp.get
    return {
        "transaction_type": g("transaction_type"),
        "property_types": g("property_type").split(",") if g("property_type") else None,
        "cities": [g("city")] if g("city") else None,
        "neighborhoods": [g("neighborhood")] if g("neighborhood") else None,
        "min_price": _num(g("min_price"), float), "max_price": _num(g("max_price"), float),
        "min_surface": _num(g("min_surface"), float), "max_surface": _num(g("max_surface"), float),
        "min_land_surface": _num(g("min_land_surface"), float), "max_land_surface": _num(g("max_land_surface"), float),
        "min_rooms": _num(g("min_rooms"), int), "max_rooms": _num(g("max_rooms"), int),
        "min_bedrooms": _num(g("min_bedrooms"), int), "max_bedrooms": _num(g("max_bedrooms"), int),
        "min_bathrooms": _num(g("min_bathrooms"), int),
        "min_floor": _num(g("min_floor"), int), "max_floor": _num(g("max_floor"), int),
        "ground_floor": g("ground_floor") == "true", "last_floor": g("last_floor") == "true",
        "min_construction_year": _num(g("min_construction_year"), int),
        "max_construction_year": _num(g("max_construction_year"), int),
        "energy_classes": g("energy_class").split(",") if g("energy_class") else None,
        "features": g("features").split(",") if g("features") else None,
        "agency_id": _num(g("agency_id"), int), "owner_type": g("owner_type"),
        "is_featured": g("is_featured") == "true", "is_urgent": g("is_urgent") == "true",
        "has_photos": g("has_photos") == "true",
        "geo": ({"lat": _num(g("lat"), float), "lng": _num(g("lng"), float), "radius": _num(g("radius"), float)}
                if g("lat") and g("lng") and g("radius") else None),
        "q": g("q"), "sort": g("sort") or "newest",
        "page": _num(g("page"), int) or 1, "per_page": _num(g("per_page"), int) or 20,
    }


def _criteria_from_body(body: dict) -> dict:
    f = (body.get("filters") or {})
    pr, sr, rr, br, cy = (f.get(k) or {} for k in
                          ("price_range", "surface_range", "rooms_range", "bedrooms_range", "construction_year_range"))
    return {
        "transaction_type": f.get("transaction_type"), "property_types": f.get("property_types"),
        "cities": f.get("cities"), "neighborhoods": f.get("neighborhoods"),
        "min_price": pr.get("min"), "max_price": pr.get("max"),
        "min_surface": sr.get("min"), "max_surface": sr.get("max"),
        "min_rooms": rr.get("min"), "max_rooms": rr.get("max"),
        "min_bedrooms": br.get("min"), "max_bedrooms": br.get("max"),
        "energy_classes": f.get("energy_classes"),
        "min_construction_year": cy.get("min"), "max_construction_year": cy.get("max"),
        "owner_type": f.get("owner_type"), "features": f.get("features"),
        "q": f.get("q") or body.get("q"),
        # Le monolithe lit `filters.sort` (défaut « relevance ») pour la recherche avancée.
        "sort": f.get("sort") or body.get("sort") or "relevance", "sort_profile": "search",
        "page": body.get("page") or 1, "per_page": body.get("per_page") or 20,
    }


# ---- Découverte (Stage 2) : reroute des routes de recherche du monolithe ----
@app.get("/properties")
def list_properties(request: Request) -> dict:
    hu, ha = moderation.hidden()
    return search_listings(_client, _criteria_from_query(request.query_params), hu, ha)


# Listes statiques renvoyées telles quelles par le monolithe (parité de `available_filters`).
_AVAILABLE_FILTERS = {
    "property_types": ["apartment", "house", "villa", "riad", "land", "commercial", "office", "garage"],
    "features": [
        "parking", "garage", "jardin", "terrasse", "balcon", "piscine",
        "ascenseur", "gardien", "climatisation", "chauffage", "meublé",
        "cuisine équipée", "cave", "vue mer", "vue montagne", "duplex",
    ],
    "energy_classes": ["A", "B", "C", "D", "E", "F", "G"],
    "sort_options": ["relevance", "newest", "price_asc", "price_desc", "surface_asc", "surface_desc"],
}


@app.post("/properties/search")
async def advanced_search(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    if not isinstance(body, dict):
        body = {}
    hu, ha = moderation.hidden()
    result = search_listings(_client, _criteria_from_body(body), hu, ha)
    # Enveloppe du monolithe : recherche IA (stub v2) + filtres disponibles.
    ai_query = body.get("ai_query")
    result["ai_response"] = {
        "status": "v2_pending",
        "message": "AI search sera disponible dans la v2",
        "original_query": ai_query,
        "tip": "Pour l'instant, utilisez les filtres avancés ci-dessous",
    } if ai_query else None
    result["available_filters"] = _AVAILABLE_FILTERS
    return result


@app.get("/properties/suggestions")
def suggestions(q: str = "") -> dict:
    return {"suggestions": suggest(_client, q)}


@app.get("/search/properties")
def search(
    q: str | None = None,
    city: str | None = None,
    transaction_type: str | None = None,
    property_type: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> dict:
    filters = {
        "city": city,
        "transaction_type": transaction_type,
        "property_type": property_type,
    }
    return search_properties(_client, q=q, filters=filters, page=page, per_page=per_page)
