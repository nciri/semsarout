"""Contrat de séjour, délégué au service `contract`.

Aucun moteur de contrat n'est réécrit ici : modèles, fusion, PDF et statuts vivent dans
`contract`. Ce client ne fait que lui passer le séjour et relire l'état. Une panne du
service est remontée telle quelle (`ContractError`) : prétendre qu'un contrat est parti
alors qu'il n'existe pas serait pire qu'un message d'erreur.
"""
import os

import httpx

from semsar_common import get_settings

CONTRACT_URL = os.environ.get("CONTRACT_URL", "http://localhost:8505")
TIMEOUT = 20.0


class ContractError(Exception):
    pass


def _headers() -> dict:
    return {"x-internal-token": get_settings().internal_token}


def _call(method: str, path: str, **kwargs) -> dict:
    try:
        resp = httpx.request(method, f"{CONTRACT_URL}{path}", headers=_headers(),
                             timeout=TIMEOUT, **kwargs)
    except httpx.HTTPError as exc:
        raise ContractError("Le service des contrats est injoignable.") from exc
    if resp.status_code >= 400:
        try:
            message = (resp.json() or {}).get("error")
        except ValueError:
            message = None
        raise ContractError(message or "Le contrat n'a pas pu être traité.")
    return resp.json() or {}


def create(agency_id: int, stay: dict, *, title: str | None = None,
           template_id: int | None = None) -> dict:
    payload = {"agency_id": agency_id, "stay": stay}
    if title:
        payload["title"] = title
    if template_id:
        payload["template_id"] = template_id
    return _call("POST", "/internal/contracts/sejour", json=payload)["contract"]


def read(agency_id: int, contract_id: int) -> dict:
    return _call("GET", f"/internal/contracts/{contract_id}",
                 params={"agency_id": agency_id})["contract"]


def sign(agency_id: int, contract_id: int, signer_name: str, signer_ip: str = "") -> dict:
    return _call("POST", f"/internal/contracts/{contract_id}/signe",
                 json={"agency_id": agency_id, "signer_name": signer_name,
                       "signer_ip": signer_ip})["contract"]
