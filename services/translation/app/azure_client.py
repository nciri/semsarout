"""Client Azure Translator — Text Translation API v3.0 (style `staymanager/app/client.py`).

En l'absence de `AZURE_TRANSLATOR_KEY`, chaque appel lève `AzureTranslatorError` (503) —
comportement volontaire : pas d'appel réseau silencieusement dégradé. Dans les tests, ce
client est toujours mocké (aucun réseau réel, aucune vraie clé).
"""
import httpx

API_VERSION = "3.0"


class AzureTranslatorError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AzureTranslatorClient:
    def __init__(self, key: str | None, endpoint: str, region: str | None):
        self.key = key
        self.endpoint = endpoint.rstrip("/")
        self.region = region

    def translate(self, texts: list[str], target: str, source: str | None = None) -> list[dict]:
        """Traduit un lot de textes en un seul appel Azure.

        Renvoie une liste ordonnée `[{"translated": str, "detected_source": str}, ...]`
        (même ordre que `texts`).
        """
        if not self.key:
            raise AzureTranslatorError(
                "Azure Translator non configuré (AZURE_TRANSLATOR_KEY manquant)", 503
            )
        params = {"api-version": API_VERSION, "to": target}
        if source:
            params["from"] = source
        headers = {
            "Ocp-Apim-Subscription-Key": self.key,
            "Content-Type": "application/json",
        }
        if self.region:
            headers["Ocp-Apim-Subscription-Region"] = self.region
        body = [{"Text": t} for t in texts]
        try:
            resp = httpx.post(
                f"{self.endpoint}/translate", params=params, headers=headers, json=body, timeout=10.0
            )
        except httpx.HTTPError as exc:
            raise AzureTranslatorError(f"Connexion Azure Translator impossible: {exc}") from exc
        if resp.status_code >= 400:
            raise AzureTranslatorError(f"Erreur Azure Translator ({resp.status_code})", resp.status_code)
        data = resp.json()
        results = []
        for item in data:
            translations = item.get("translations") or []
            translated = translations[0]["text"] if translations else ""
            detected = (item.get("detectedLanguage") or {}).get("language") or source
            results.append({"translated": translated, "detected_source": detected})
        return results
