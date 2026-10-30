"""Appels synchrones à directory pour les dépenses d'intervention — fail-closed.

Une liste vide ne doit jamais signifier « directory n'a pas répondu » : un CRG bâti avec
0 dépense à tort enverrait au propriétaire un net faux.
"""
import os

import httpx

from semsar_common import get_settings

_DIRECTORY_URL = os.environ.get("DIRECTORY_URL", "http://localhost:8011")


class DepensesIndisponibles(Exception):
    pass


def _appeler(methode: str, chemin: str, **kwargs) -> dict:
    try:
        r = getattr(httpx, methode)(f"{_DIRECTORY_URL}{chemin}",
                                    headers={"x-internal-token": get_settings().internal_token},
                                    timeout=10.0, **kwargs)
        if r.status_code != 200:
            raise DepensesIndisponibles(f"directory a répondu {r.status_code}")
        corps = r.json()
    except httpx.HTTPError as e:
        raise DepensesIndisponibles(str(e)) from e
    except ValueError as e:
        raise DepensesIndisponibles("réponse de directory illisible") from e
    if not isinstance(corps, dict):
        raise DepensesIndisponibles("réponse de directory illisible")
    return corps


def imputables(property_ids: list[int], mode: str, agency_id: int,
               lease_id: int | None = None) -> list[dict]:
    params: dict = {"property_ids": ",".join(str(i) for i in property_ids), "mode": mode,
                    "agency_id": agency_id}
    if lease_id is not None:
        params["lease_id"] = lease_id
    lignes = _appeler("get", "/internal/work-orders/chargeable", params=params).get("work_orders")
    if not isinstance(lignes, list):
        raise DepensesIndisponibles("réponse de directory illisible")
    return lignes


def estampiller(ids: list[int], ref: str, agency_id: int) -> int:
    corps = _appeler("post", "/internal/work-orders/charged",
                     json={"ids": ids, "ref": ref, "agency_id": agency_id})
    stamped = corps.get("stamped")
    if not isinstance(stamped, int):
        raise DepensesIndisponibles("réponse de directory illisible")
    return stamped
