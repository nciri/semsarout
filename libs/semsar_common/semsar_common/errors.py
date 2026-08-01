"""Erreurs uniformes au format RFC 9457 (application/problem+json)."""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Problem(Exception):
    """Un problème RFC 9457. Levez-le n'importe où : le handler produit le bon corps."""
    status: int
    title: str
    detail: str | None = None
    type: str = "about:blank"
    instance: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {"type": self.type, "title": self.title, "status": self.status}
        if self.detail:
            body["detail"] = self.detail
        if self.instance:
            body["instance"] = self.instance
        body.update(self.extra)
        return body


def bad_request(detail: str | None = None, **extra: Any) -> Problem:
    return Problem(400, "Bad Request", detail, extra=extra)


def unauthorized(detail: str | None = None, **extra: Any) -> Problem:
    return Problem(401, "Unauthorized", detail, extra=extra)


def forbidden(detail: str | None = None, **extra: Any) -> Problem:
    return Problem(403, "Forbidden", detail, extra=extra)


def not_found(detail: str | None = None, **extra: Any) -> Problem:
    return Problem(404, "Not Found", detail, extra=extra)


def conflict(detail: str | None = None, **extra: Any) -> Problem:
    return Problem(409, "Conflict", detail, extra=extra)


def install_legacy_error_handlers(app: Any) -> None:
    """Pour les services qui reproduisent les erreurs LEGACY `{'error': msg}` du monolithe :
    convertit les `Problem` levés par les dépendances d'auth (require_*, get_principal) en
    `{'error': ...}` avec le bon statut — sinon FastAPI renvoie 500 sur un Problem non géré."""
    from fastapi import Request
    from fastapi.responses import JSONResponse

    @app.exception_handler(Problem)
    async def _legacy_problem(request: Request, exc: Problem):  # noqa: ANN202
        return JSONResponse({"error": exc.detail or exc.title}, status_code=exc.status)


def install_error_handlers(app: Any) -> None:
    """Enregistre les handlers RFC 9457 sur une application FastAPI."""
    from fastapi import Request
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse
    from starlette.exceptions import HTTPException as StarletteHTTPException

    def _response(problem: Problem, request: "Request") -> JSONResponse:
        body = problem.to_dict()
        body.setdefault("instance", str(request.url.path))
        return JSONResponse(status_code=problem.status, content=body,
                            media_type="application/problem+json")

    @app.exception_handler(Problem)
    async def _handle_problem(request: Request, exc: Problem):  # noqa: ANN202
        return _response(exc, request)

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http(request: Request, exc: StarletteHTTPException):  # noqa: ANN202
        return _response(Problem(exc.status_code, str(exc.detail or "Error")), request)

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(request: Request, exc: RequestValidationError):  # noqa: ANN202
        return _response(
            Problem(422, "Unprocessable Entity", "La requête est invalide.",
                    extra={"errors": exc.errors()}),
            request,
        )
