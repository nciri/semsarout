"""Garde-fou SSRF partagé — bloque les hôtes internes/loopback/privés pour
les URLs de webhook fournies par les partenaires.

Deux usages distincts, tous les deux nécessaires :

- `is_blocked_literal_url` : appelé à la validation (création/mise à jour du
  webhook, `app/schemas.py`). Pas de résolution DNS bloquante dans une
  requête synchrone — seuls les hôtes déjà exprimés en IP littérale
  (y compris les notations alternatives que la libc accepte : `127.1`,
  `0177.0.0.1` en octal, `0x7f.0.0.1` en hex — via `socket.inet_aton`) sont
  vérifiés contre la blocklist ; les noms d'hôte sont juste vérifiés pour
  `localhost`/absence de point.
- `is_blocked_url` : appelé juste avant le POST réel (`app/main.py` et
  `app/worker.py`). Résout l'hôte via `socket.getaddrinfo` et bloque si UNE
  IP résolue est interne — seul rempart réel contre le DNS-rebinding (un
  hôte public au moment de la validation peut résoudre vers une IP privée
  au moment de la livraison).
"""
import ipaddress
import socket
from urllib.parse import urlparse

IpAddress = ipaddress.IPv4Address | ipaddress.IPv6Address


def normalize_host(host: str) -> str:
    """Retire un éventuel point final (FQDN absolu, ex. `169.254.169.254.`)
    et met en minuscules avant toute comparaison."""
    host = host.strip()
    if host.endswith("."):
        host = host[:-1]
    return host.lower()


def _permissive_ipv4(host: str) -> ipaddress.IPv4Address | None:
    """`inet_aton` accepte les notations IPv4 alternatives (octal, hex,
    formes courtes type `127.1`) que la libc résout — les mêmes que celles
    qu'httpx/urllib3 laisseront passer au niveau OS. On les normalise donc
    ici pour les soumettre à la blocklist plutôt que de les laisser filer
    en `ValueError` chez `ipaddress.ip_address` (strict)."""
    try:
        packed = socket.inet_aton(host)
    except OSError:
        return None
    return ipaddress.IPv4Address(socket.inet_ntoa(packed))


def parse_literal_ip(host: str) -> IpAddress | None:
    """Interprète `host` comme IP littérale, de façon stricte d'abord
    (`ipaddress.ip_address`, couvre IPv4 pointé-décimal standard et IPv6),
    puis de façon permissive pour les notations IPv4 alternatives."""
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass
    return _permissive_ipv4(host)


def is_blocked_ip(ip: IpAddress) -> bool:
    return (
        ip.is_loopback or ip.is_private or ip.is_link_local
        or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


def is_internal_hostname(host: str) -> bool:
    return host == "localhost" or "." not in host


def is_blocked_literal_url(url: str) -> bool:
    """Vérification à la validation — sans résolution DNS. Renvoie True si
    l'URL doit être refusée."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return True
    host = parsed.hostname
    if not host:
        return True
    host = normalize_host(host)
    ip = parse_literal_ip(host)
    if ip is not None:
        return is_blocked_ip(ip)
    return is_internal_hostname(host)


def is_blocked_url(url: str) -> bool:
    """Vérification à la livraison — juste avant le POST réel. Résout
    l'hôte et bloque si une IP résolue est interne (défense en profondeur
    contre le DNS-rebinding : un hôte valide à la création peut résoudre
    vers une IP privée au moment de l'envoi). Échec de résolution = refusé
    (fail-closed)."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return True
    host = parsed.hostname
    if not host:
        return True
    host = normalize_host(host)
    ip = parse_literal_ip(host)
    if ip is not None:
        return is_blocked_ip(ip)
    if is_internal_hostname(host):
        return True
    try:
        infos = socket.getaddrinfo(host, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return True
    for info in infos:
        addr = info[4][0]
        try:
            resolved_ip = ipaddress.ip_address(addr)
        except ValueError:
            return True
        if is_blocked_ip(resolved_ip):
            return True
    return False
