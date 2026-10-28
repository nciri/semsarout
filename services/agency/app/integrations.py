"""Connecteurs ERP/CRM d'une agence : Odoo, SAP, Salesforce, HubSpot, Zoho.

Chaque fournisseur déclare trois choses : les champs que l'agence doit fournir, un appel de
**vérification** (qui prouve que les identifiants ouvrent bien le compte annoncé) et, quand
c'est possible, l'**envoi d'un contact**. Rien n'est simulé : une connexion n'est
enregistrée qu'après un aller-retour réussi chez le tiers.

Parti pris sur l'authentification : l'agence colle un jeton obtenu chez son fournisseur
(jeton d'application privée HubSpot, jeton OAuth Salesforce/Zoho, clé technique SAP) ou ses
identifiants Odoo. Pas de danse OAuth ici — elle demanderait une application déclarée chez
chaque éditeur, et un écran de redirection intestable sans ces comptes.

Les erreurs renvoyées au back-office sont tronquées et ne contiennent jamais d'identifiant :
le message du tiers suffit à comprendre (401, instance inconnue, droit manquant).
"""
import ipaddress
import socket
from urllib.parse import urlsplit

import httpx

TIMEOUT = 10.0
ERROR_MAX = 200

# Ces URL viennent d'un compte d'agence : sans contrôle, notre serveur irait interroger
# n'importe quoi à sa place — service interne du maillage, métadonnées de l'hébergeur — et
# l'agence lirait la réponse dans le message d'erreur. D'où : HTTPS exigé, hôte résolu et
# refusé s'il pointe vers une adresse privée, et aucun corps de réponse renvoyé à l'appelant.
HOSTED_HOSTS = {
    "salesforce": (".my.salesforce.com", ".salesforce.com"),
    "zoho": ("www.zohoapis.com", "www.zohoapis.eu", "www.zohoapis.in", "www.zohoapis.jp",
             "www.zohoapis.com.au", "www.zohoapis.ca", "www.zohoapis.sa"),
}
URL_FIELDS = {"odoo": "url", "sap": "base_url", "salesforce": "instance_url",
              "zoho": "api_domain"}


class IntegrationError(Exception):
    """Le fournisseur a refusé l'appel : message lisible, sans secret."""


def _short(text: str) -> str:
    return (text or "").strip().replace("\n", " ")[:ERROR_MAX]


def _public_host(host: str) -> None:
    """Refuse un hôte qui résout vers une adresse non routable publiquement."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise IntegrationError("Hôte introuvable.") from exc
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        if (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved
                or addr.is_multicast or addr.is_unspecified):
            raise IntegrationError("Adresse interdite : l'URL doit désigner un service public.")


def safe_base_url(raw: str, provider: str) -> str:
    """URL de fournisseur acceptable, normalisée. Lève `IntegrationError` sinon.

    Pour les services hébergés (Salesforce, Zoho), l'hôte doit appartenir au domaine de
    l'éditeur ; pour un ERP auto-hébergé (Odoo, SAP), on exige au moins HTTPS et une adresse
    publique. Un re-résolution malveillante entre ce contrôle et l'appel reste théoriquement
    possible : le filtrage d'hôte ci-dessus en est la limite connue.
    """
    parts = urlsplit((raw or "").strip())
    if parts.scheme != "https":
        raise IntegrationError("L'URL doit commencer par https://.")
    if parts.username or parts.password or parts.query or parts.fragment:
        raise IntegrationError("L'URL ne doit contenir ni identifiant ni paramètre.")
    host = (parts.hostname or "").lower()
    if not host:
        raise IntegrationError("URL invalide.")
    allowed = HOSTED_HOSTS.get(provider)
    if allowed and not any(host == a or host.endswith(a) for a in allowed):
        raise IntegrationError(f"Hôte inattendu pour ce fournisseur : {host}.")
    _public_host(host)
    port = f":{parts.port}" if parts.port else ""
    return f"https://{host}{port}{parts.path.rstrip('/')}"


def _request(method: str, url: str, **kw) -> httpx.Response:
    try:
        resp = httpx.request(method, url, timeout=TIMEOUT, follow_redirects=False, **kw)
    except httpx.HTTPError as exc:
        raise IntegrationError(_short(f"Service injoignable : {exc.__class__.__name__}")) from exc
    if resp.status_code in (401, 403):
        raise IntegrationError("Identifiants refusés par le fournisseur.")
    if resp.status_code >= 400:
        # Jamais le corps de la réponse : il sortirait tel quel vers l'agence.
        raise IntegrationError(f"Réponse {resp.status_code} du fournisseur.")
    return resp


# ---- Odoo (JSON-RPC) --------------------------------------------------------------------

def _odoo_rpc(url: str, service: str, method: str, args: list):
    payload = {"jsonrpc": "2.0", "method": "call",
               "params": {"service": service, "method": method, "args": args}}
    body = _request("POST", f"{url.rstrip('/')}/jsonrpc", json=payload).json()
    if body.get("error"):
        message = (body["error"].get("data") or {}).get("message") or body["error"].get("message")
        raise IntegrationError(_short(message or "Appel Odoo refusé."))
    return body.get("result")


def _odoo_uid(c: dict) -> int:
    uid = _odoo_rpc(c["url"], "common", "login", [c["db"], c["login"], c["password"]])
    if not uid:
        raise IntegrationError("Base, identifiant ou mot de passe Odoo refusés.")
    return uid


def _odoo_test(c: dict) -> str:
    uid = _odoo_uid(c)
    version = (_odoo_rpc(c["url"], "common", "version", []) or {}).get("server_version", "")
    return _short(f"{c['db']} · utilisateur {uid}" + (f" · Odoo {version}" if version else ""))


def _odoo_push(c: dict, contact: dict) -> None:
    uid = _odoo_uid(c)
    values = {"name": contact["name"], "email": contact.get("email") or False,
              "phone": contact.get("phone") or False, "city": contact.get("city") or False,
              "type": "contact"}
    _odoo_rpc(c["url"], "object", "execute_kw",
              [c["db"], uid, c["password"], "res.partner", "create", [values]])


# ---- HubSpot (jeton d'application privée) -----------------------------------------------

def _hubspot_headers(c: dict) -> dict:
    return {"Authorization": f"Bearer {c['token']}", "Content-Type": "application/json"}


def _hubspot_test(c: dict) -> str:
    _request("GET", "https://api.hubapi.com/crm/v3/objects/contacts",
             params={"limit": 1}, headers=_hubspot_headers(c))
    return "HubSpot · jeton valide"


def _hubspot_push(c: dict, contact: dict) -> None:
    properties = {"firstname": contact.get("first_name"), "lastname": contact.get("last_name"),
                  "email": contact.get("email"), "phone": contact.get("phone"),
                  "city": contact.get("city")}
    _request("POST", "https://api.hubapi.com/crm/v3/objects/contacts",
             headers=_hubspot_headers(c),
             json={"properties": {k: v for k, v in properties.items() if v}})


# ---- Salesforce (jeton OAuth + instance) ------------------------------------------------

def _sf_base(c: dict) -> str:
    return f"{c['instance_url'].rstrip('/')}/services/data/v59.0"


def _sf_test(c: dict) -> str:
    body = _request("GET", f"{_sf_base(c)}/sobjects/Contact/describe",
                    headers={"Authorization": f"Bearer {c['access_token']}"}).json()
    return _short(f"{c['instance_url']} · objet {body.get('name', 'Contact')}")


def _sf_push(c: dict, contact: dict) -> None:
    fields = {"LastName": contact.get("last_name") or contact["name"],
              "FirstName": contact.get("first_name"), "Email": contact.get("email"),
              "Phone": contact.get("phone"), "MailingCity": contact.get("city")}
    _request("POST", f"{_sf_base(c)}/sobjects/Contact",
             headers={"Authorization": f"Bearer {c['access_token']}",
                      "Content-Type": "application/json"},
             json={k: v for k, v in fields.items() if v})


# ---- Zoho CRM (jeton OAuth + domaine d'API) ---------------------------------------------

def _zoho_headers(c: dict) -> dict:
    return {"Authorization": f"Zoho-oauthtoken {c['access_token']}",
            "Content-Type": "application/json"}


def _zoho_test(c: dict) -> str:
    _request("GET", f"{c['api_domain'].rstrip('/')}/crm/v5/settings/modules",
             headers=_zoho_headers(c))
    return _short(f"{c['api_domain']} · modules accessibles")


def _zoho_push(c: dict, contact: dict) -> None:
    fields = {"Last_Name": contact.get("last_name") or contact["name"],
              "First_Name": contact.get("first_name"), "Email": contact.get("email"),
              "Phone": contact.get("phone"), "Mailing_City": contact.get("city")}
    _request("POST", f"{c['api_domain'].rstrip('/')}/crm/v5/Contacts",
             headers=_zoho_headers(c),
             json={"data": [{k: v for k, v in fields.items() if v}]})


# ---- SAP (OData Business Partner) -------------------------------------------------------

def _sap_test(c: dict) -> str:
    url = f"{c['base_url'].rstrip('/')}/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata"
    _request("GET", url, headers={"Authorization": f"Bearer {c['token']}"})
    return _short(f"{c['base_url']} · API_BUSINESS_PARTNER")


PROVIDERS = {
    "odoo": {"kind": "erp", "fields": ("url", "db", "login", "password"),
             "secret_fields": ("password",), "test": _odoo_test, "push": _odoo_push},
    "sap": {"kind": "erp", "fields": ("base_url", "token"),
            "secret_fields": ("token",), "test": _sap_test, "push": None},
    "salesforce": {"kind": "crm", "fields": ("instance_url", "access_token"),
                   "secret_fields": ("access_token",), "test": _sf_test, "push": _sf_push},
    "hubspot": {"kind": "crm", "fields": ("token",),
                "secret_fields": ("token",), "test": _hubspot_test, "push": _hubspot_push},
    "zoho": {"kind": "crm", "fields": ("api_domain", "access_token"),
             "secret_fields": ("access_token",), "test": _zoho_test, "push": _zoho_push},
}


def credentials_from(provider: str, data: dict) -> dict:
    """Identifiants attendus par ce fournisseur, et rien d'autre. Lève si l'un manque.

    L'URL est contrôlée ici, avant tout appel : c'est le seul champ que l'agence fournit et
    qui décide de la destination d'une requête partant de nos serveurs.
    """
    spec = PROVIDERS[provider]
    out = {}
    for field in spec["fields"]:
        raw = data.get(field)
        value = raw.strip() if isinstance(raw, str) else raw
        if not value:
            raise IntegrationError(f"Champ obligatoire manquant : {field}.")
        out[field] = safe_base_url(value, provider) if field == URL_FIELDS.get(provider) else value
    return out


def _vetted(provider: str, credentials: dict) -> dict:
    """Revalide l'URL stockée : une connexion enregistrée hier ne doit pas rouvrir la porte."""
    field = URL_FIELDS.get(provider)
    if not field:
        return credentials
    return {**credentials, field: safe_base_url(credentials.get(field, ""), provider)}


def check(provider: str, credentials: dict) -> str:
    """Appel réel chez le fournisseur. Renvoie le compte reconnu, lève `IntegrationError`."""
    return PROVIDERS[provider]["test"](_vetted(provider, credentials))


def push_contact(provider: str, credentials: dict, contact: dict) -> bool:
    """Crée le contact chez le tiers. `False` si le fournisseur ne gère pas cet envoi."""
    sender = PROVIDERS[provider]["push"]
    if sender is None:
        return False
    sender(_vetted(provider, credentials), contact)
    return True
