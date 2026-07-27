"""Helpers du service programs (erreurs legacy, JSON, dates, nombres)."""
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


def num(v):
    return float(v) if v is not None else None


def to_number(value, cast=float):
    if value is None or value == "":
        return None
    try:
        return cast(value)
    except (TypeError, ValueError):
        return None
