"""Client Partner API StayManager.ma — port minimal (mêmes appels que le monolithe).

En dev, sans clé/API joignable, chaque appel lève StayManagerError (parité du comportement
d'échec du monolithe). Base URL configurable via STAYMANAGER_BASE_URL.
"""
import os

import httpx


class StayManagerError(Exception):
    def __init__(self, message: str, status_code: int = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class StayManagerClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = os.environ.get("STAYMANAGER_BASE_URL", "https://staymanager.ma/api/v1")

    def _request(self, method: str, endpoint: str, **kwargs):
        try:
            resp = httpx.request(method, f"{self.base_url}{endpoint}",
                                 headers={"Authorization": f"Bearer {self.api_key}"}, timeout=10.0, **kwargs)
        except httpx.HTTPError as exc:
            raise StayManagerError(f"Connexion impossible: {exc}") from exc
        if resp.status_code >= 400:
            raise StayManagerError(f"Erreur API ({resp.status_code})", resp.status_code)
        return resp.json()

    def get_profile(self):
        return self._request("GET", "/user/profile")

    def get_properties(self):
        return self._request("GET", "/properties")

    def get_property(self, pid):
        return self._request("GET", f"/properties/{pid}")

    def get_reservations(self, property_id=None):
        return self._request("GET", "/reservations", params={"property_id": property_id} if property_id else None)

    def get_availability(self, pid, start, end):
        return self._request("GET", f"/properties/{pid}/availability", params={"start": start, "end": end})

    def get_ical_url(self, pid):
        return self._request("GET", f"/properties/{pid}/ical").get("url")

    def register_webhook(self, url, secret, events):
        return self._request("POST", "/webhooks", json={"url": url, "secret": secret, "events": events})

    def delete_webhook(self, wid):
        return self._request("DELETE", f"/webhooks/{wid}")
