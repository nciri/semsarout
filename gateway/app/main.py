"""BFF / gateway SemsarOut.

Phase 0 : proxy transparent de `/api/*` vers le monolithe Flask, en préservant
**exactement** le contrat consommé par le frontend (cf. ADR-0003). Au fil du
strangler, `proxy()` sera remplacé route par route par des appels aux nouveaux
services et par de l'agrégation (BFF).
"""
import re
import time
from contextlib import asynccontextmanager

import httpx
import jwt as pyjwt
from fastapi import FastAPI, Request, Response
from prometheus_fastapi_instrumentator import Instrumentator

from semsar_common import install_error_handlers, setup_logging, setup_tracing

from .config import get_settings

settings = get_settings()
setup_logging(settings.service_name, settings.log_level)

# En-têtes hop-by-hop à ne pas relayer.
_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}

# Cache court d'identités résolues (clé = jeton Bearer).
_IDENTITY_CACHE: dict[str, tuple[float, dict]] = {}


def _identity_from_claims(payload: dict) -> dict:
    sub = payload.get("sub")
    return {
        "user_id": int(sub) if isinstance(sub, str) and sub.isdigit() else sub,
        "agency_id": payload.get("agency_id"),
        "is_superadmin": bool(payload.get("is_superadmin")),
        "role": payload.get("account_role"),
        "features": payload.get("features") or [],
    }


async def _resolve_identity(app: FastAPI, authorization: str | None) -> dict | None:
    """Valide le jeton et renvoie le contexte d'auth (user_id, agency_id, is_superadmin,
    role, features). **Priorité : validation LOCALE du JWT** (signature + claims embarqués),
    sans appeler le monolithe. Repli /auth/me uniquement pour les anciens jetons sans claims."""
    if not authorization:
        return None
    now = time.monotonic()
    cached = _IDENTITY_CACHE.get(authorization)
    if cached and cached[0] > now:
        return cached[1]

    # Validation LOCALE seulement si une clé est configurée (jamais de clé codée en dur).
    if settings.jwt_secret_key:
        token = authorization[7:].strip() if authorization[:7].lower() == "bearer " else authorization
        try:
            payload = pyjwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        except pyjwt.PyJWTError:
            return None  # signature/expiration invalide → rejet (pas d'appel monolithe)
        # Jeton enrichi → résolution 100 % locale (frontière d'auth sévrée).
        if "account_role" in payload or "is_superadmin" in payload:
            ident = _identity_from_claims(payload)
            _IDENTITY_CACHE[authorization] = (now + settings.identity_ttl_seconds, ident)
            return ident

    # Monolithe décommissionné : plus de repli. Un jeton sans claims (ancien, émis avant que
    # identity ne devienne l'émetteur) est rejeté → l'utilisateur se reconnecte (nouveau jeton
    # enrichi). Les claims (dont `features`) sont désormais toujours forgés par identity.
    return None


def _inject_identity(headers: dict, ident: dict) -> None:
    if ident.get("user_id") is not None:
        headers["x-semsar-user-id"] = str(ident["user_id"])
    if ident.get("agency_id") is not None:
        headers["x-semsar-agency-id"] = str(ident["agency_id"])
    headers["x-semsar-superadmin"] = "1" if ident.get("is_superadmin") else "0"
    if ident.get("role"):
        headers["x-semsar-roles"] = str(ident["role"])
    if ident.get("features"):
        headers["x-semsar-features"] = ",".join(ident["features"])


# listing (Stage 1) : seulement le détail/CRUD/publish/my-properties (méthode + motif précis).
# La découverte (GET /properties, /search, /suggestions), contact, price-position → monolithe.
_LISTING_ID = re.compile(r"^/api/v1/properties/\d+$")
_LISTING_PUBLISH = re.compile(r"^/api/v1/properties/\d+/publish$")
# Engagement (Stage 3) : contact & reveal-phone (publics).
_LISTING_ENGAGE = re.compile(r"^/api/v1/properties/\d+/(contact|reveal-phone)$")
# Gestion des biens en backoffice (détail/maj/suppression) → listing.
_BO_PROPERTY_ID = re.compile(r"^/api/v1/backoffice/properties/\d+$")
# Téléchargement d'un document de bien (authentifié) → listing.
_DOCUMENTS_ID = re.compile(r"^/api/v1/documents/\d+$")
# Leads publics gérés par l'utilisateur : GET /leads/{id} + PUT /leads/{id}/status → crm.
_CRM_LEADS_PUBLIC = re.compile(r"^/api/v1/leads/\d+(/status)?$")
# Lecture détail d'un compte (super-admin) : GET → analytics (agrégat). Les ÉCRITURES de
# modération (même préfixe) restent à trust-safety.
_ADMIN_ACCOUNT_DETAIL = re.compile(r"^/api/v1/admin/accounts/(users|agencies)/\d+$")


def _listing_match(path: str, method: str) -> bool:
    if method == "GET" and path == "/api/v1/my-properties":
        return True
    if method == "POST" and path == "/api/v1/properties":
        return True
    if method in ("GET", "PUT", "DELETE") and _LISTING_ID.match(path):
        return True
    if method == "POST" and (_LISTING_PUBLISH.match(path) or _LISTING_ENGAGE.match(path)):
        return True
    if method == "POST" and path == "/api/v1/estimate":  # estimation prix (comparables actifs)
        return True
    # Médias + dossier de vente en ligne (stockage objet).
    if method == "POST" and path in ("/api/v1/uploads", "/api/v1/sale-requests"):
        return True
    if method == "GET" and _DOCUMENTS_ID.match(path):
        return True
    # Gestion des biens en backoffice (liste/détail/CRUD, cloisonnée agence).
    if path == "/api/v1/backoffice/properties" and method in ("GET", "POST"):
        return True
    if _BO_PROPERTY_ID.match(path) and method in ("GET", "PUT", "DELETE"):
        return True
    return False


# Table de routage strangler : (préfixe /api → (client, réécriture de préfixe)).
# Un préfixe absent => le monolithe. Étendue à chaque nouveau service extrait.
def _search_discovery_match(path: str, method: str) -> bool:
    return (
        (method == "GET" and path == "/api/v1/properties")
        or (method == "POST" and path == "/api/v1/properties/search")
        or (method == "GET" and path == "/api/v1/properties/suggestions")
    )


_GEO_PRICE = re.compile(r"^/api/v1/properties/\d+/price-position$")
# RBAC écritures utilisateur (rôles/activation) → identity ; GET /backoffice/users reste au monolithe.
_RBAC_USER_WRITE = re.compile(r"^/api/v1/backoffice/users/\d+/(roles|activate|deactivate)$")
# agency (lecture) : liste, détail par slug, sous-chemin /properties, et /my-agency (avec membres).
_AGENCY_SLUG = re.compile(r"^/api/v1/agencies/[^/]+$")
_AGENCY_PROPS = re.compile(r"^/api/v1/agencies/[^/]+/properties$")
_AGENCY_REGEN = re.compile(r"^/api/v1/agencies/[^/]+/regenerate-api-key$")


def _agency_match(path: str, method: str) -> bool:
    if method == "GET":
        return (path == "/api/v1/agencies" or path == "/api/v1/my-agency"
                or bool(_AGENCY_SLUG.match(path)) or bool(_AGENCY_PROPS.match(path)))
    if method == "POST":  # création + régénération de clé API
        return path == "/api/v1/agencies" or bool(_AGENCY_REGEN.match(path))
    if method == "PUT":   # mise à jour (par slug)
        return bool(_AGENCY_SLUG.match(path))
    return False


def _geo_match(path: str, method: str) -> bool:
    return bool(_GEO_PRICE.match(path) or path.startswith("/api/v1/market/"))


def _resolve_upstream(app: FastAPI, path: str, method: str):
    # geo AVANT listing : /properties/{id}/price-position + /market/* → geo.
    if settings.geo_url and _geo_match(path, method):
        return app.state.geo, path.replace("/api/v1", "", 1)
    if settings.agency_url and _agency_match(path, method):
        return app.state.agency, path.replace("/api/v1", "", 1)
    # Paramètres backoffice de l'agence (config commission/notifications/SMTP) → agency.
    if settings.agency_url and path == "/api/v1/backoffice/settings" and method in ("GET", "PUT"):
        return app.state.agency, path.replace("/api/v1", "", 1)
    if settings.audit_url and path.startswith("/api/v1/admin/activity"):
        return app.state.audit, path.replace("/api/v1", "", 1)
    # listing (détail/CRUD) AVANT la découverte (search) : /properties/{id} → listing.
    if settings.listing_url and _listing_match(path, method):
        return app.state.listing, path.replace("/api/v1", "", 1)
    if settings.search_url and _search_discovery_match(path, method):
        return app.state.search, path.replace("/api/v1", "", 1)
    # identity = auth complète : émission JWT (login/refresh) + **écritures compte**
    # (register, PUT/DELETE /auth/me, change-password) + lecture /auth/me.
    if settings.identity_url and (
        path in ("/api/v1/auth/login", "/api/v1/auth/refresh",
                 "/api/v1/auth/register", "/api/v1/auth/change-password",
                 "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password")
        or path == "/api/v1/auth/me"  # GET (lecture) + PUT (profil) + DELETE (suppression)
    ):
        return app.state.identity, path.replace("/api/v1", "", 1)
    # RBAC rôles (lecture + CRUD) & permissions (lecture) → identity.
    if settings.identity_url and (
        path.startswith("/api/v1/backoffice/roles")
        or (method == "GET" and path == "/api/v1/backoffice/permissions")
        or (method == "GET" and path == "/api/v1/backoffice/users")  # liste users backoffice
    ):
        return app.state.identity, path.replace("/api/v1", "", 1)
    # Impersonation super-admin (émission d'un JWT au nom d'autrui) → identity (émetteur des
    # jetons). AVANT la règle trust-safety `/admin/accounts/*` : ce n'est pas de la modération.
    if settings.identity_url and path.startswith("/api/v1/admin/accounts/users/") \
            and path.endswith("/impersonate"):
        return app.state.identity, path.replace("/api/v1", "", 1)
    # Config widgets du tableau de bord (sur le compte) → identity. Le reste de /dashboard*
    # (agrégats) reste au monolithe (T3 analytics à venir).
    if settings.identity_url and path == "/api/v1/backoffice/dashboard/config":
        return app.state.identity, path.replace("/api/v1", "", 1)
    # dashboard (KPIs + charts + activity) → analytics ; /config déjà routé vers identity ci-dessus.
    if settings.analytics_url and path.startswith("/api/v1/backoffice/dashboard"):
        return app.state.analytics, path.replace("/api/v1/backoffice", "", 1)
    # analytics : agrégats extraits (financial/pipeline/ping). market/team/overview + stats/dashboard
    # restent au monolithe pour l'instant. Préfixe /api/v1/backoffice retiré → /analytics/*.
    if settings.analytics_url and path in (
        "/api/v1/backoffice/analytics/ping",
        "/api/v1/backoffice/analytics/financial",
        "/api/v1/backoffice/analytics/pipeline",
        "/api/v1/backoffice/analytics/market",
        "/api/v1/backoffice/analytics/team",
        "/api/v1/backoffice/analytics/overview",
    ):
        return app.state.analytics, path.replace("/api/v1/backoffice", "", 1)
    # stats/* (tout le groupe extrait) → analytics.
    if settings.analytics_url and path.startswith("/api/v1/backoffice/stats/"):
        return app.state.analytics, path.replace("/api/v1/backoffice", "", 1)
    # Overview plateforme super-admin (agrège users/agences/abonnements) → analytics.
    if settings.analytics_url and method == "GET" and path == "/api/v1/admin/overview":
        return app.state.analytics, path.replace("/api/v1", "", 1)
    # Lecture comptes super-admin : liste + détail user/agence → analytics (agrégat). AVANT la
    # règle trust-safety `/admin/accounts/*` (qui ne sert que les ÉCRITURES de modération).
    if settings.analytics_url and method == "GET" and (
        path == "/api/v1/admin/accounts" or _ADMIN_ACCOUNT_DETAIL.match(path)
    ):
        return app.state.analytics, path.replace("/api/v1", "", 1)
    # RBAC écritures (gestion utilisateur : rôles / activation) → identity.
    if settings.identity_url and _RBAC_USER_WRITE.match(path):
        return app.state.identity, path.replace("/api/v1", "", 1)
    # Équipes & invitations (gestion + acceptation) → identity.
    if settings.identity_url and (
        path.startswith("/api/v1/backoffice/team")
        or path.startswith("/api/v1/invitations/")
    ):
        return app.state.identity, path.replace("/api/v1", "", 1)
    if settings.identity_url and path.startswith("/api/v1/identity"):
        return app.state.identity, path.replace("/api/v1/identity", "/identity", 1)
    if settings.search_url and path.startswith("/api/v1/search"):
        return app.state.search, path.replace("/api/v1/search", "/search", 1)
    if settings.analytics_url and path.startswith("/api/v1/analytics"):
        return app.state.analytics, path.replace("/api/v1/analytics", "/analytics", 1)
    if settings.contract_url and path.startswith("/api/v1/contract"):
        return app.state.contract, path.replace("/api/v1/contract", "/contract", 1)
    if settings.legal_url and path.startswith("/api/v1/legal"):
        return app.state.legal, path.replace("/api/v1/legal", "/legal", 1)
    # payment (routes legacy) : intention + webhook + statut + historique.
    if settings.payment_url and (
        path.startswith("/api/v1/payments/") or path == "/api/v1/my-payments"
    ):
        return app.state.payment, path.replace("/api/v1", "", 1)
    if settings.payment_url and path.startswith("/api/v1/payment"):
        return app.state.payment, path.replace("/api/v1/payment", "/payment", 1)
    if settings.billing_url and path.startswith("/api/v1/billing"):
        return app.state.billing, path.replace("/api/v1/billing", "/billing", 1)
    # Extraction du domaine boutique : routes EXISTANTES reroutées (préfixe /api/v1 retiré).
    if settings.catalog_url and (
        path.startswith("/api/v1/backoffice/shop/products")
        or path.startswith("/api/v1/backoffice/shop/categories")
        or path.startswith("/api/v1/admin/products")
    ):
        return app.state.catalog, path.replace("/api/v1", "", 1)
    if settings.marketplace_url and (
        path.startswith("/api/v1/backoffice/shop/cart")
        or path.startswith("/api/v1/backoffice/shop/orders")
        or path.startswith("/api/v1/admin/orders")
    ):
        return app.state.marketplace, path.replace("/api/v1", "", 1)
    if settings.directory_url and (
        path.startswith("/api/v1/backoffice/artisans")
        or path.startswith("/api/v1/backoffice/artisan-trades")
        or path.startswith("/api/v1/backoffice/work-orders")
        or path.startswith("/api/v1/admin/shared-artisans")
    ):
        return app.state.directory, path.replace("/api/v1", "", 1)
    if settings.messaging_url and path.startswith("/api/v1/buyer/messages"):
        return app.state.messaging, path.replace("/api/v1", "", 1)
    if settings.buyer_url and (
        path.startswith("/api/v1/buyer/saved-searches")
        or path.startswith("/api/v1/buyer/favorites")
        or path.startswith("/api/v1/buyer/estimates")
    ):
        return app.state.buyer, path.replace("/api/v1", "", 1)
    if settings.programs_url and path.startswith("/api/v1/programs"):
        return app.state.programs, path.replace("/api/v1", "", 1)
    if settings.staymanager_url and path.startswith("/api/v1/integrations/staymanager"):
        return app.state.staymanager, path.replace("/api/v1", "", 1)
    if settings.trust_safety_url and (
        path.startswith("/api/v1/admin/accounts/users/")
        or path.startswith("/api/v1/admin/accounts/agencies/")
    ):
        return app.state.trust_safety, path.replace("/api/v1", "", 1)
    if settings.crm_url and (
        path.startswith("/api/v1/backoffice/leads")
        or path.startswith("/api/v1/backoffice/clients")
        or path.startswith("/api/v1/backoffice/visits")
        or path.startswith("/api/v1/backoffice/calendar")
    ):
        return app.state.crm, path.replace("/api/v1", "", 1)
    # Leads publics / « mes leads » (page contact publique + gestion par l'utilisateur) → crm.
    # (contact/reveal-phone sur une annonce restent chez listing, cf. _LISTING_ENGAGE.)
    if settings.crm_url and (
        (method == "POST" and path == "/api/v1/contact")
        or (method == "GET" and path in ("/api/v1/my-leads", "/api/v1/my-leads/summary"))
        or _CRM_LEADS_PUBLIC.match(path)
    ):
        return app.state.crm, path.replace("/api/v1", "", 1)
    if settings.transactions_url and path.startswith("/api/v1/backoffice/transactions"):
        return app.state.transactions, path.replace("/api/v1", "", 1)
    if settings.rental_url and path.startswith("/api/v1/backoffice/gestion-locative"):
        return app.state.rental, path.replace("/api/v1", "", 1)
    if settings.rental_url and path.startswith("/api/v1/gestion-locative"):
        return app.state.rental, path.replace("/api/v1", "", 1)
    if settings.legal_url and (
        path.startswith("/api/v1/backoffice/notaries")
        or path.startswith("/api/v1/backoffice/legal-cases")
        or path.startswith("/api/v1/backoffice/legal-tasks")
    ):
        return app.state.legal, path.replace("/api/v1", "", 1)
    if settings.contract_url and (
        path.startswith("/api/v1/backoffice/contracts")
        or path.startswith("/api/v1/backoffice/contract-templates")
    ):
        return app.state.contract, path.replace("/api/v1", "", 1)
    # billing : plans + abonnement (routes legacy). `/my-subscription` sert aussi au repli
    # features du BFF, mais celui-ci appelle le monolithe directement (hors routage).
    if settings.billing_url and (
        path.startswith("/api/v1/subscription-plans")
        or path.startswith("/api/v1/subscription/")
        or path == "/api/v1/my-subscription"
        or path == "/api/v1/cancel-subscription"
        or path == "/api/v1/invoices"
        or path.startswith("/api/v1/invoices/")  # factures (liste + PDF)
    ):
        return app.state.billing, path.replace("/api/v1", "", 1)
    # Monolithe décommissionné : plus de repli. Toute route non mappée → 404 (client None).
    return None, path


def _client_or_none(url: str | None) -> httpx.AsyncClient | None:
    return httpx.AsyncClient(base_url=url, timeout=settings.request_timeout) if url else None


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.monolith = httpx.AsyncClient(
        base_url=settings.upstream_url, timeout=settings.request_timeout
    )
    app.state.identity = _client_or_none(settings.identity_url)
    app.state.search = _client_or_none(settings.search_url)
    app.state.analytics = _client_or_none(settings.analytics_url)
    app.state.contract = _client_or_none(settings.contract_url)
    app.state.legal = _client_or_none(settings.legal_url)
    app.state.payment = _client_or_none(settings.payment_url)
    app.state.billing = _client_or_none(settings.billing_url)
    app.state.catalog = _client_or_none(settings.catalog_url)
    app.state.marketplace = _client_or_none(settings.marketplace_url)
    app.state.directory = _client_or_none(settings.directory_url)
    app.state.listing = _client_or_none(settings.listing_url)
    app.state.crm = _client_or_none(settings.crm_url)
    app.state.transactions = _client_or_none(settings.transactions_url)
    app.state.rental = _client_or_none(settings.rental_url)
    app.state.buyer = _client_or_none(settings.buyer_url)
    app.state.programs = _client_or_none(settings.programs_url)
    app.state.staymanager = _client_or_none(settings.staymanager_url)
    app.state.geo = _client_or_none(settings.geo_url)
    app.state.messaging = _client_or_none(settings.messaging_url)
    app.state.trust_safety = _client_or_none(settings.trust_safety_url)
    app.state.agency = _client_or_none(settings.agency_url)
    app.state.audit = _client_or_none(settings.audit_url)
    yield
    for client in (
        app.state.monolith, app.state.identity, app.state.search,
        app.state.analytics, app.state.contract, app.state.legal,
        app.state.payment, app.state.billing, app.state.catalog, app.state.marketplace,
        app.state.directory, app.state.listing, app.state.crm, app.state.transactions,
        app.state.rental,
        app.state.buyer, app.state.programs, app.state.staymanager, app.state.geo,
        app.state.messaging, app.state.trust_safety, app.state.agency, app.state.audit,
    ):
        if client is not None:
            await client.aclose()


app = FastAPI(title="SemsarOut — BFF/gateway", lifespan=lifespan)
install_error_handlers(app)

# Tracing best-effort : ne bloque pas le démarrage si le collector est absent.
try:
    setup_tracing(app, settings.service_name, settings.otlp_endpoint)
except Exception:  # noqa: BLE001
    pass

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
async def proxy(path: str, request: Request) -> Response:
    app = request.app
    client, upstream_path = _resolve_upstream(app, request.url.path, request.method)
    if client is None:  # route non servie par v2 (monolithe décommissionné)
        return Response(content=b'{"error":"Not found"}', status_code=404, media_type="application/json")
    url = upstream_path
    if request.url.query:
        url = f"{url}?{request.url.query}"
    # Filtrer : hop-by-hop + tout X-Semsar-* ENTRANT (anti-usurpation : seul le BFF les pose).
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP and not k.lower().startswith("x-semsar-")
    }
    # Frontière d'auth : tous les upstreams sont des services internes → injecter l'identité.
    ident = await _resolve_identity(app, request.headers.get("authorization"))
    if ident:
        _inject_identity(headers, ident)
    upstream = await client.request(
        request.method, url, headers=headers, content=await request.body()
    )
    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )


@app.api_route("/uploads/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def uploads_proxy(path: str, request: Request) -> Response:
    """Sert les médias publics (`/uploads/photos/*`) depuis le service listing (stockage objet),
    en remplacement du disque du monolithe. Repli monolithe si listing absent."""
    app = request.app
    client = app.state.listing
    if client is None or ".." in path:  # anti-traversée : pas de segments remontants
        return Response(content=b"", status_code=404)
    upstream = await client.request("GET", f"/uploads/{path}")
    resp_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP}
    return Response(content=upstream.content, status_code=upstream.status_code,
                    headers=resp_headers, media_type=upstream.headers.get("content-type"))
