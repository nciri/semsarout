"""Helpers du service staymanager (erreurs legacy, JSON, dates, noms de fichiers)."""
import re

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


_UNSAFE_IN_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(raw: str | None, fallback: str) -> str:
    """Nom de fichier réduit à un jeu sûr : il repart dans un en-tête `Content-Disposition`.

    Un nom contenant un saut de ligne ou un guillemet y injecterait un en-tête, et un nom
    plein de « ../ » brouillerait la lecture côté poste de l'agent.
    """
    name = _UNSAFE_IN_FILENAME.sub("_", (raw or "").strip()).strip("._-")
    return name[:120] or fallback


def attachment_headers(filename: str) -> dict:
    """En-têtes de téléchargement : nom cité, et jamais interprété par le navigateur."""
    return {"Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff"}
