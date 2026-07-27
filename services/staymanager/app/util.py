"""Helpers du service staymanager (erreurs legacy, JSON, dates)."""
from fastapi import Request
from fastapi.responses import JSONResponse


def err(msg: str, code: int, **extra) -> JSONResponse:
    return JSONResponse({"error": msg, **extra}, status_code=code)


async def json_body(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return data if isinstance(data, dict) else {}


def iso(v):
    return v.isoformat() if v else None
