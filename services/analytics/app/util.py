"""Helpers du service analytics (erreurs legacy)."""
from fastapi.responses import JSONResponse


def err(msg: str, code: int) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)
