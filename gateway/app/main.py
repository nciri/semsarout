"""BFF / gateway SemsarOut.

Phase 0 : proxy transparent de `/api/*` vers le monolithe Flask, en préservant
**exactement** le contrat consommé par le frontend (cf. ADR-0003). Au fil du
strangler, `proxy()` sera remplacé route par route par des appels aux nouveaux
services et par de l'agrégation (BFF).
"""
import asyncio
import re
import secrets
import time
from contextlib import asynccontextmanager

import httpx
import jwt as pyjwt
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
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

_KNOWN_TENANTS = {"semsar", "m3a-l3achrane"}


def _parse_tenant_hosts(raw: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for pair in raw.split(","):
        host, _, tenant = pair.partition("=")
        if host.strip() and tenant.strip() in _KNOWN_TENANTS:
            mapping[host.strip().lower()] = tenant.strip()
    return mapping


_TENANT_HOSTS = _parse_tenant_hosts(settings.tenant_hosts)


def _resolve_tenant(headers, host: str) -> str:
    """Tenant de la requête : en-tête x-tenant honoré uniquement si tenant_dev_header
    (opt-in dev), sinon table Host."""
    if settings.tenant_dev_header:
        wanted = headers.get("x-tenant")
        if wanted in _KNOWN_TENANTS:
            return wanted
    return _TENANT_HOSTS.get((host or "").split(":")[0].lower(), "semsar")


def _identity_from_claims(payload: dict) -> dict:
    sub = payload.get("sub")
    return {
        "user_id": int(sub) if isinstance(sub, str) and sub.isdigit() else sub,
        "agency_id": payload.get("agency_id"),
        "is_superadmin": bool(payload.get("is_superadmin")),
        "role": payload.get("account_role"),
        "features": payload.get("features") or [],
        "tenant": payload.get("tenant") or "semsar",
    }


async def _resolve_identity(
    app: FastAPI, authorization: str | None, cookie_access: str | None = None
) -> dict | None:
    """Valide le jeton et renvoie le contexte d'auth (user_id, agency_id, is_superadmin,
    role, features). **Priorité : validation LOCALE du JWT** (signature + claims embarqués),
    sans appeler le monolithe. Repli /auth/me uniquement pour les anciens jetons sans claims.

    Source du jeton : en-tête `Authorization` en priorité (rétro-compat clients existants /
    monolithe séparé) ; à défaut, cookie httpOnly `m3a_access` (durcissement m3a-l3achrane)."""
    authorization = authorization or (f"Bearer {cookie_access}" if cookie_access else None)
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


def _is_https(request: Request) -> bool:
    """Secure=true si la requête (ou le proxy en amont) est en HTTPS — jamais en dev http,
    sinon le navigateur rejette silencieusement le cookie. Hors dev (`environment != "dev"`),
    Secure est FORCÉ même si le reverse-proxy prod omet `X-Forwarded-Proto` : on ne veut
    jamais de cookie de session sans Secure en environnement non-dev."""
    if settings.environment != "dev":
        return True
    if request.url.scheme == "https":
        return True
    return request.headers.get("x-forwarded-proto", "").lower() == "https"


# Réponses d'auth susceptibles de porter des jetons à convertir en cookies httpOnly.
_AUTH_COOKIE_PATHS = {"/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/register"}
# Endpoints d'auth exemptés du contrôle CSRF (émission/révocation de session, pas de mutation
# métier authentifiée par cookie).
_CSRF_EXEMPT_PATHS = {
    "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/register", "/api/v1/auth/logout",
}
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _set_auth_cookies(response: Response, body: dict, secure: bool) -> None:
    """Pose les cookies de session à partir du corps JSON d'une réponse login/refresh/register.
    Le corps JSON renvoyé au client reste inchangé (rétro-compat)."""
    access = body.get("access_token") if isinstance(body, dict) else None
    if not access:
        return
    response.set_cookie(
        settings.cookie_access_name, access, max_age=settings.cookie_access_ttl_seconds,
        path="/api", httponly=True, samesite="lax", secure=secure,
    )
    response.set_cookie(
        settings.cookie_authed_name, "1", max_age=settings.cookie_access_ttl_seconds,
        path="/", httponly=False, samesite="lax", secure=secure,
    )
    response.set_cookie(
        settings.cookie_csrf_name, secrets.token_urlsafe(32),
        max_age=settings.cookie_access_ttl_seconds,
        path="/", httponly=False, samesite="lax", secure=secure,
    )
    refresh = body.get("refresh_token")
    if refresh:
        response.set_cookie(
            settings.cookie_refresh_name, refresh, max_age=settings.cookie_refresh_ttl_seconds,
            path="/api/v1/auth/refresh", httponly=True, samesite="lax", secure=secure,
        )


def _clear_auth_cookies(response: Response, secure: bool) -> None:
    response.delete_cookie(settings.cookie_access_name, path="/api", samesite="lax", secure=secure)
    response.delete_cookie(
        settings.cookie_refresh_name, path="/api/v1/auth/refresh", samesite="lax", secure=secure
    )
    response.delete_cookie(settings.cookie_csrf_name, path="/", samesite="lax", secure=secure)
    response.delete_cookie(settings.cookie_authed_name, path="/", samesite="lax", secure=secure)


def _csrf_required(request: Request) -> bool:
    """CSRF exigé seulement pour les mutations authentifiées PAR COOKIE (pas d'en-tête
    Authorization) : double-submit m3a_csrf. Les clients Bearer (rétro-compat) sont exemptés —
    ils ne portent pas le cookie de session, donc pas de CSRF cross-site possible via cookie."""
    if request.method not in _MUTATING_METHODS:
        return False
    if request.url.path in _CSRF_EXEMPT_PATHS:
        return False
    if request.headers.get("authorization"):
        return False
    return bool(request.cookies.get(settings.cookie_access_name))


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
    # commission (back-office) : le gate `/internal/commission/gate` est interne
    # (appelé service→service), pas exposé via le BFF.
    if settings.commission_url and path.startswith("/api/v1/backoffice/commission"):
        return app.state.commission, path.replace("/api/v1", "", 1)
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
    # translation : cache Postgres devant Azure Translator, endpoint unique /v1/translate.
    if settings.translation_url and path == "/api/v1/translate":
        return app.state.translation, path.replace("/api/v1", "", 1)
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
    if settings.messaging_url and path.startswith("/api/v1/messaging"):
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
    if settings.selling_url and path.startswith("/api/v1/vente"):
        return app.state.selling, path.replace("/api/v1", "", 1)
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
    # M3a-L3achrane (coloc) : GET /api/v1/listings est désormais l'endpoint composite
    # (voir `coloc_listings_composite`, déclaré avant le catch-all `proxy()`) ; tout le
    # reste (détail, CRUD, cycle de vie) va au service coloc-listing.
    if settings.coloc_listing_url and (
        path == "/api/v1/listings"
        or path.startswith("/api/v1/listings/")
        or path == "/api/v1/me/listings"
    ):
        return app.state.coloc_listing, path.replace("/api/v1", "", 1)
    if settings.coloc_profile_url and (
        path in ("/api/v1/me/profile", "/api/v1/me/lifestyle", "/api/v1/me/favorites")
        or path.startswith("/api/v1/me/favorites/")
    ):
        return app.state.coloc_profile, path.replace("/api/v1", "", 1)
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
    app.state.commission = _client_or_none(settings.commission_url)
    app.state.selling = _client_or_none(settings.selling_url)
    app.state.coloc_listing = _client_or_none(settings.coloc_listing_url)
    app.state.coloc_profile = _client_or_none(settings.coloc_profile_url)
    app.state.matching = _client_or_none(settings.matching_url)
    app.state.translation = _client_or_none(settings.translation_url)
    yield
    for client in (
        app.state.monolith, app.state.identity, app.state.search,
        app.state.analytics, app.state.contract, app.state.legal,
        app.state.payment, app.state.billing, app.state.catalog, app.state.marketplace,
        app.state.directory, app.state.listing, app.state.crm, app.state.transactions,
        app.state.rental,
        app.state.buyer, app.state.programs, app.state.staymanager, app.state.geo,
        app.state.messaging, app.state.trust_safety, app.state.agency, app.state.audit,
        app.state.commission, app.state.selling, app.state.coloc_listing,
        app.state.coloc_profile, app.state.matching, app.state.translation,
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


def _merge_match_scores(items: list, scores: dict) -> None:
    """Injecte match_pct quand un score existe ; null/absent → clé absente (front masque)."""
    for item in items:
        score = scores.get(item.get("listing_id"))
        if score is not None:
            item["match_pct"] = score


@app.get("/api/v1/listings", include_in_schema=False)
async def coloc_listings_composite(request: Request) -> Response:
    """Unique endpoint composite du BFF : recherche coloc + scores de compatibilité.

    Anonyme → résultats sans score. Authentifié (tenant m3a-l3achrane) → enrichit
    chaque annonce d'un match_pct via l'API interne matching. matching indisponible
    → dégradation : résultats SANS score, jamais d'échec de la recherche (spec §8).
    """
    app_ = request.app
    if app_.state.search is None:
        return Response(content=b'{"error":"Not found"}', status_code=404,
                        media_type="application/json")
    tenant = _resolve_tenant(request.headers, request.headers.get("host", ""))
    ident = await _resolve_identity(
        app_, request.headers.get("authorization"),
        request.cookies.get(settings.cookie_access_name),
    )
    if ident and ident.get("tenant", "semsar") != tenant:
        return Response(content=b'{"error":"Tenant mismatch"}', status_code=403,
                        media_type="application/json")
    url = "/listings" + (f"?{request.url.query}" if request.url.query else "")
    upstream = await app_.state.search.request(
        "GET", url, headers={"x-semsar-tenant": tenant})
    if upstream.status_code != 200 or ident is None or app_.state.matching is None:
        return Response(content=upstream.content, status_code=upstream.status_code,
                        media_type="application/json")
    data = upstream.json()
    ids = [i.get("listing_id") for i in data.get("items", []) if i.get("listing_id")]
    scores: dict = {}
    if ids:
        try:
            r = await app_.state.matching.request(
                "POST", "/internal/scores",
                json={"user_id": ident["user_id"], "listing_ids": ids},
                headers={"x-internal-token": settings.internal_token})
            if r.status_code == 200:
                scores = r.json().get("scores", {})
        except Exception:  # noqa: BLE001 — dégradation sans score
            scores = {}
    _merge_match_scores(data.get("items", []), scores)
    return JSONResponse(data)


async def _fetch_internal_stats(
    client: httpx.AsyncClient | None, path: str, tenant: str, headers: dict
) -> dict | None:
    """Un sous-compteur de l'overview back-office : `None` si le service est absent, en panne,
    ou répond en erreur — jamais d'exception qui ferait échouer l'agrégat complet."""
    if client is None:
        return None
    try:
        r = await client.request("GET", path, params={"tenant": tenant}, headers=headers)
    except Exception:  # noqa: BLE001 — dégradation service par service
        return None
    if r.status_code != 200:
        return None
    return r.json()


@app.get("/api/v1/backoffice/overview", include_in_schema=False)
async def backoffice_overview(request: Request) -> Response:
    """KPIs consolidés de la vue d'ensemble back-office m3a (super-admin uniquement) : fan-out
    vers identity(tenant)+coloc-listing+coloc-profile `/internal/stats`. Dégradation propre par
    service (sous-clé `null`) si un service échoue — jamais d'échec global de la vue (spec §8)."""
    app_ = request.app
    tenant = _resolve_tenant(request.headers, request.headers.get("host", ""))
    ident = await _resolve_identity(
        app_, request.headers.get("authorization"),
        request.cookies.get(settings.cookie_access_name),
    )
    if ident is None or not ident.get("is_superadmin"):
        return Response(content=b'{"error":"Forbidden"}', status_code=403,
                        media_type="application/json")
    if ident.get("tenant", "semsar") != tenant:
        return Response(content=b'{"error":"Tenant mismatch"}', status_code=403,
                        media_type="application/json")
    headers = {"x-internal-token": settings.internal_token}
    users_stats, listings_stats, profiles_stats = await asyncio.gather(
        _fetch_internal_stats(app_.state.identity, "/internal/users/stats", tenant, headers),
        _fetch_internal_stats(app_.state.coloc_listing, "/internal/stats", tenant, headers),
        _fetch_internal_stats(app_.state.coloc_profile, "/internal/stats", tenant, headers),
    )
    return JSONResponse({
        "tenant": tenant,
        "users": users_stats,
        "listings": listings_stats,
        "profiles": profiles_stats,
    })


def _forbidden_json(message: str = "Forbidden") -> Response:
    return Response(content=('{"error":"%s"}' % message).encode(), status_code=403,
                    media_type="application/json")


async def _require_backoffice_superadmin(request: Request):
    """Garde commune aux routes back-office composites (parité `backoffice_overview`) : jeton
    valide + super-admin + tenant du jeton == tenant de la requête. Retourne `(None, tenant,
    ident)` (autorisé) ou `(Response 403, tenant, None)` prêt à renvoyer tel quel."""
    app_ = request.app
    tenant = _resolve_tenant(request.headers, request.headers.get("host", ""))
    ident = await _resolve_identity(
        app_, request.headers.get("authorization"),
        request.cookies.get(settings.cookie_access_name),
    )
    if ident is None or not ident.get("is_superadmin"):
        return _forbidden_json(), tenant, None
    if ident.get("tenant", "semsar") != tenant:
        return _forbidden_json("Tenant mismatch"), tenant, None
    return None, tenant, ident


@app.get("/api/v1/backoffice/verifications", include_in_schema=False)
async def backoffice_verifications(request: Request) -> Response:
    """File de vérification KYC en attente du tenant m3a (super-admin uniquement) : proxy
    vers identity `/internal/kyc/queue` (source réelle des candidatures CIN/étudiant/employeur)."""
    denied, tenant, _ident = await _require_backoffice_superadmin(request)
    if denied is not None:
        return denied
    app_ = request.app
    client = app_.state.identity
    if client is None:
        return JSONResponse({"tenant": tenant, "items": []})
    headers = {"x-internal-token": settings.internal_token}
    try:
        r = await client.request("GET", "/internal/kyc/queue", params={"tenant": tenant}, headers=headers)
    except Exception:  # noqa: BLE001 — dégradation propre si identity est indisponible
        return JSONResponse({"tenant": tenant, "items": []})
    if r.status_code != 200:
        return JSONResponse({"tenant": tenant, "items": []})
    return JSONResponse({"tenant": tenant, **r.json()})


async def _backoffice_kyc_action(request: Request, kyc_id: int, action: str) -> Response:
    denied, _tenant, _ident = await _require_backoffice_superadmin(request)
    if denied is not None:
        return denied
    app_ = request.app
    client = app_.state.identity
    if client is None:
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    headers = {"x-internal-token": settings.internal_token}
    try:
        r = await client.request("POST", f"/internal/kyc/{kyc_id}/{action}", headers=headers)
    except Exception:  # noqa: BLE001
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    return Response(content=r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type"))


@app.post("/api/v1/backoffice/verifications/{kyc_id}/verify", include_in_schema=False)
async def backoffice_verifications_verify(kyc_id: int, request: Request) -> Response:
    return await _backoffice_kyc_action(request, kyc_id, "verify")


@app.post("/api/v1/backoffice/verifications/{kyc_id}/reject", include_in_schema=False)
async def backoffice_verifications_reject(kyc_id: int, request: Request) -> Response:
    return await _backoffice_kyc_action(request, kyc_id, "reject")


@app.get("/api/v1/backoffice/listings", include_in_schema=False)
async def backoffice_listings(request: Request) -> Response:
    """File des annonces à modérer du tenant m3a (super-admin uniquement) : proxy vers
    coloc-listing `/internal/listings/queue` (statut EN_MODERATION par défaut, filtrable
    via `?status=`). Les actions (approuver/rejeter) restent servies par les routes
    existantes `POST /api/v1/listings/{id}/(approve|reject)` (proxy générique, garde
    superadmin déjà en place côté service)."""
    denied, tenant, _ident = await _require_backoffice_superadmin(request)
    if denied is not None:
        return denied
    app_ = request.app
    client = app_.state.coloc_listing
    if client is None:
        return JSONResponse({"tenant": tenant, "items": []})
    headers = {"x-internal-token": settings.internal_token}
    params = {"tenant": tenant}
    status = request.query_params.get("status")
    if status:
        params["status"] = status
    try:
        r = await client.request("GET", "/internal/listings/queue", params=params, headers=headers)
    except Exception:  # noqa: BLE001 — dégradation propre si coloc-listing est indisponible
        return JSONResponse({"tenant": tenant, "items": []})
    if r.status_code != 200:
        return JSONResponse({"tenant": tenant, "items": []})
    return JSONResponse({"tenant": tenant, **r.json()})


async def _backoffice_user_action(request: Request, user_id: int, action: str) -> Response:
    """Suspend/réactive un compte du tenant courant (super-admin uniquement) : proxy vers
    identity `/internal/accounts/users/{id}/{action}` (modération de compte, déjà implémentée
    côté identity — `services/identity/app/accounts.py`). `tenant` + `actor_id` (garde
    auto-action) transmis pour cloisonnement, comme `_backoffice_kyc_action`."""
    denied, tenant, ident = await _require_backoffice_superadmin(request)
    if denied is not None:
        return denied
    app_ = request.app
    client = app_.state.identity
    if client is None:
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    headers = {"x-internal-token": settings.internal_token}
    params = {"tenant": tenant}
    actor_id = ident.get("user_id") if ident else None
    if actor_id is not None:
        params["actor_id"] = actor_id
    try:
        r = await client.request("POST", f"/internal/accounts/users/{user_id}/{action}",
                                 params=params, headers=headers)
    except Exception:  # noqa: BLE001
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    return Response(content=r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type"))


@app.post("/api/v1/backoffice/users/{user_id}/suspend", include_in_schema=False)
async def backoffice_users_suspend(user_id: int, request: Request) -> Response:
    return await _backoffice_user_action(request, user_id, "suspend")


@app.post("/api/v1/backoffice/users/{user_id}/unsuspend", include_in_schema=False)
async def backoffice_users_unsuspend(user_id: int, request: Request) -> Response:
    return await _backoffice_user_action(request, user_id, "unsuspend")


@app.get("/api/v1/backoffice/matching-weights", include_in_schema=False)
async def backoffice_matching_weights_get(request: Request) -> Response:
    """Pondération active du scoring matching (super-admin, lecture) : proxy vers
    matching `/internal/weights`. Nom de route distinct de `/api/v1/backoffice/settings`
    (déjà pris par le service `agency`, config commission du back-office legacy) pour
    éviter toute collision de proxy générique (cf. `_resolve_upstream` ligne ~274)."""
    denied, _tenant, _ident = await _require_backoffice_superadmin(request)
    if denied is not None:
        return denied
    app_ = request.app
    client = app_.state.matching
    if client is None:
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    headers = {"x-internal-token": settings.internal_token}
    try:
        r = await client.request("GET", "/internal/weights", headers=headers)
    except Exception:  # noqa: BLE001 — dégradation propre si matching est indisponible
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    return Response(content=r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type"))


@app.put("/api/v1/backoffice/matching-weights", include_in_schema=False)
async def backoffice_matching_weights_put(request: Request) -> Response:
    """Édite la pondération active du scoring matching (super-admin) : proxy vers
    matching `PUT /internal/weights` (crée une nouvelle version horodatée et l'active)."""
    denied, _tenant, _ident = await _require_backoffice_superadmin(request)
    if denied is not None:
        return denied
    app_ = request.app
    client = app_.state.matching
    if client is None:
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    body = await request.body()
    headers = {"x-internal-token": settings.internal_token, "content-type": "application/json"}
    try:
        r = await client.request("PUT", "/internal/weights", content=body, headers=headers)
    except Exception:  # noqa: BLE001
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    return Response(content=r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type"))


@app.get("/api/v1/backoffice/lifestyle-referential", include_in_schema=False)
async def backoffice_lifestyle_referential(request: Request) -> Response:
    """Référentiel lifestyle m3a (super-admin, lecture seule) : proxy vers coloc-profile
    `/internal/lifestyle-referential`. Module Python statique côté service (pas de table
    versionnée) : pas de route d'édition tant que le référentiel n'est pas migré en base."""
    denied, _tenant, _ident = await _require_backoffice_superadmin(request)
    if denied is not None:
        return denied
    app_ = request.app
    client = app_.state.coloc_profile
    if client is None:
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    headers = {"x-internal-token": settings.internal_token}
    try:
        r = await client.request("GET", "/internal/lifestyle-referential", headers=headers)
    except Exception:  # noqa: BLE001
        return Response(content=b'{"error":"Service indisponible"}', status_code=502,
                        media_type="application/json")
    return Response(content=r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type"))


@app.post("/api/v1/auth/logout", include_in_schema=False)
async def logout(request: Request) -> Response:
    """Révoque la session côté BFF (efface les cookies). Servi par le BFF lui-même, pas
    relayé à identity : la déconnexion n'a pas besoin de round-trip upstream."""
    response = Response(status_code=204)
    _clear_auth_cookies(response, _is_https(request))
    return response


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
async def proxy(path: str, request: Request) -> Response:
    app = request.app
    if _csrf_required(request):
        csrf_cookie = request.cookies.get(settings.cookie_csrf_name)
        csrf_header = request.headers.get("x-csrf-token")
        if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_header, csrf_cookie):
            return Response(content=b'{"error":"CSRF token invalid"}', status_code=403,
                            media_type="application/json")
    client, upstream_path = _resolve_upstream(app, request.url.path, request.method)
    if client is None:  # route non servie par v2 (monolithe décommissionné)
        return Response(content=b'{"error":"Not found"}', status_code=404, media_type="application/json")
    url = upstream_path
    if request.url.query:
        url = f"{url}?{request.url.query}"
    tenant = _resolve_tenant(request.headers, request.headers.get("host", ""))
    # Filtrer : hop-by-hop + tout X-Semsar-* ENTRANT (anti-usurpation : seul le BFF les pose)
    # + x-tenant (consommé ici, jamais relayé).
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP
        and not k.lower().startswith("x-semsar-")
        and k.lower() != "x-tenant"
    }
    # /auth/refresh : pas d'en-tête Authorization → repli sur le refresh token du cookie
    # httpOnly (rétro-compat : l'en-tête reste prioritaire s'il est fourni).
    if request.url.path == "/api/v1/auth/refresh" and not request.headers.get("authorization"):
        refresh_cookie = request.cookies.get(settings.cookie_refresh_name)
        if refresh_cookie:
            headers["Authorization"] = f"Bearer {refresh_cookie}"
    # Frontière d'auth : tous les upstreams sont des services internes → injecter l'identité.
    ident = await _resolve_identity(
        app, request.headers.get("authorization"),
        request.cookies.get(settings.cookie_access_name),
    )
    if ident:
        if ident.get("tenant", "semsar") != tenant:
            # Jeton d'un produit utilisé sur l'autre (semsar ⇄ m3a-l3achrane) → rejet.
            return Response(content=b'{"error":"Tenant mismatch"}', status_code=403,
                            media_type="application/json")
        _inject_identity(headers, ident)
    headers["x-semsar-tenant"] = tenant
    upstream = await client.request(
        request.method, url, headers=headers, content=await request.body()
    )
    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    response = Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )
    if request.url.path in _AUTH_COOKIE_PATHS and 200 <= upstream.status_code < 300:
        try:
            body = upstream.json()
        except ValueError:
            body = {}
        _set_auth_cookies(response, body, _is_https(request))
    return response


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
