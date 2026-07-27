"""Audit de routage strangler : quelles routes appelées par le front tombent encore au monolithe.

Résout chaque (méthode, chemin) appelé par frontend/src à travers le vrai `_resolve_upstream`
du BFF (gateway/app/main.py), en stubbant les upstreams par leur nom. Sortie groupée par
service ; le groupe MONOLITH = la surface restante à extraire avant d'éteindre :7000.

    python3 tools/route_audit.py
"""
import os, re, sys, glob
from types import SimpleNamespace

# 1. Set every *_URL so settings.<svc>_url is truthy (gateway gates each rule on it).
SVCS = ["upstream","identity","search","analytics","contract","legal","payment","billing",
        "catalog","marketplace","directory","crm","transactions","messaging","trust_safety",
        "geo","agency","audit","listing","buyer","programs","staymanager"]
for s in SVCS:
    os.environ[s.upper()+"_URL"] = f"http://{s}"
os.environ.setdefault("JWT_SECRET_KEY","x"); os.environ.setdefault("INTERNAL_TOKEN","x")

sys.path.insert(0, "gateway")
from app import main as gw  # noqa: E402

# 2. Fake app whose state.<svc> == the service name (so resolve returns the name).
state = SimpleNamespace()
for s in SVCS:
    setattr(state, "trust_safety" if s=="trust_safety" else s, s)
state.monolith = "MONOLITH"
app = SimpleNamespace(state=state)

def resolve(method, path):
    try:
        client, _ = gw._resolve_upstream(app, path, method)
        return client if isinstance(client, str) else "MONOLITH"
    except Exception as e:
        return f"ERR:{e}"

# 3. Extract (method, path) the frontend calls. axios instance methods + raw axios('/api/v1..').
CALL = re.compile(r"""\.(get|post|put|delete|patch)\(\s*([`'"])([^`'"]+)\2""", re.I)
RAW  = re.compile(r"""axios\.(get|post|put|delete|patch)\(\s*([`'"])(/api/v1[^`'"]+)\2""", re.I)
files = []
for ext in ("js","jsx","ts","tsx"):
    files += glob.glob(f"frontend/src/**/*.{ext}", recursive=True)

def norm(p):
    p = p.split("?")[0].split("#")[0]
    p = re.sub(r"\$\{[^}]+\}", "1", p)        # template vars -> 1
    p = re.sub(r"/:[A-Za-z_]+", "/1", p)      # :id style -> 1
    if not p.startswith("/api/v1"):
        if p.startswith("/"): p = "/api/v1" + p
        else: return None                      # relative/non-API (assets etc.)
    return p

calls = set()
unresolved = 0
for f in files:
    try: txt = open(f, encoding="utf-8").read()
    except: continue
    for rx in (CALL, RAW):
        for m in rx.finditer(txt):
            method, path = m.group(1).upper(), m.group(3)
            # skip obvious non-endpoints
            if path.startswith("http") or " " in path:
                continue
            np = norm(path)
            if np is None:
                continue
            if "${" in path and not np.startswith("/api/v1/"):
                unresolved += 1; continue
            calls.add((method, np))

# 4. Resolve each, group by upstream.
by_up = {}
for method, path in sorted(calls):
    up = resolve(method, path)
    by_up.setdefault(up, []).append((method, path))

print(f"# Endpoints found: {len(calls)} distinct (method,path)  |  files scanned: {len(files)}\n")
for up in sorted(by_up, key=lambda u: (u!="MONOLITH", u)):
    tag = "  <<< STILL MONOLITH" if up=="MONOLITH" else ""
    print(f"== {up} ({len(by_up[up])}){tag} ==")
    for method, path in by_up[up]:
        print(f"   {method:6} {path}")
    print()
