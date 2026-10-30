"""Client TTLock : mot de passe clavier d'un séjour, création et révocation.

Reprise de StayManager (`app/services/ttlock_service.py`) resserrée sur les deux appels dont
un séjour a besoin, et rebranchée sur l'agence :

- **Les identifiants appartiennent à l'agence**, pas à la plateforme : chaque agence a son
  compte TTLock. Ils sont confinés à ce service et ne ressortent jamais d'une API.
- **Rien n'est simulé.** Sans compte TTLock raccordé, la génération échoue proprement et le
  séjour reste en mode manuel (code posé à la main par l'agence) — personne ne reçoit un
  code qui n'ouvre rien.
- La durée de validité du code est celle du séjour, bornée de quelques heures de part et
  d'autre : un voyageur en avance ou un départ tardif ne doit pas rester dehors.
"""
import time
from datetime import datetime, timedelta

import httpx

BASE_URL = "https://euapi.ttlock.com"
TIMEOUT = 20.0
EARLY_HOURS = 3        # le code ouvre quelques heures avant l'arrivée annoncée
LATE_HOURS = 3         # et reste valable un peu après le départ
PASSWORD_TYPE_TIMED = 2

FIELDS = ("client_id", "client_secret", "access_token", "lock_id")
SECRET_FIELDS = ("client_secret", "access_token")


class LockError(Exception):
    """Échec côté serrure : message lisible pour l'agence, jamais le corps du fournisseur."""


def window(check_in: datetime, check_out: datetime) -> tuple[datetime, datetime]:
    return check_in - timedelta(hours=EARLY_HOURS), check_out + timedelta(hours=LATE_HOURS)


def _ms(value: datetime) -> int:
    return int(value.timestamp() * 1000)


def credentials_from(data: dict) -> dict:
    """Identifiants attendus, et rien d'autre. Lève si l'un manque."""
    out = {}
    for field in FIELDS:
        raw = data.get(field)
        value = raw.strip() if isinstance(raw, str) else raw
        if not value:
            raise LockError(f"Champ obligatoire manquant : {field}.")
        out[field] = str(value)
    return out


def _call(path: str, credentials: dict, params: dict) -> dict:
    payload = {**params, "clientId": credentials["client_id"],
               "accessToken": credentials["access_token"],
               "date": int(time.time() * 1000)}
    try:
        resp = httpx.post(f"{BASE_URL}{path}", data=payload, timeout=TIMEOUT,
                          follow_redirects=False)
    except httpx.HTTPError as exc:
        raise LockError(f"Serrure injoignable : {exc.__class__.__name__}") from exc
    if resp.status_code >= 400:
        raise LockError(f"Réponse {resp.status_code} du fournisseur de serrures.")
    try:
        body = resp.json()
    except ValueError as exc:
        raise LockError("Réponse illisible du fournisseur de serrures.") from exc
    if body.get("errcode"):
        # Le message du fournisseur n'est pas recopié : il peut contenir nos identifiants.
        raise LockError(f"La serrure a refusé la demande (code {body['errcode']}).")
    return body


def create_code(credentials: dict, check_in: datetime, check_out: datetime) -> dict:
    """Mot de passe clavier valable sur la durée du séjour. Renvoie `{code, external_id}`."""
    start, end = window(check_in, check_out)
    body = _call("/v3/lock/getPassword", credentials, {
        "lockId": credentials["lock_id"], "startDate": _ms(start), "endDate": _ms(end),
        "passwordType": PASSWORD_TYPE_TIMED})
    code = str(body.get("keyboardPwd") or "").strip()
    if not code:
        raise LockError("La serrure n'a renvoyé aucun code.")
    return {"code": code, "external_id": str(body.get("keyboardPwdId") or "") or None}


def revoke_code(credentials: dict, external_id: str) -> None:
    _call("/v3/lock/deletePassword", credentials,
          {"lockId": credentials["lock_id"], "passwordId": external_id})
