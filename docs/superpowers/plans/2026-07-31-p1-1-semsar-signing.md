# Plan P1-1 — Lib partagée `semsar_signing`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraire le client 3a9dSign (`services/rental/app/signing.py`) en lib partagée `libs/semsar_signing`, réutilisable par `rental` et le futur `selling`, sans changer le comportement de rental.

**Architecture:** Le client de signature est déjà autonome (dépendances : `os` + `httpx` uniquement ; variables d'env `SIGN_API_URL`, `SIGN_API_KEY`, `S3_ENDPOINT_URL`). On le déplace tel quel dans une lib `libs/semsar_signing`, on ajoute la dépendance au `pyproject.toml` de rental, et on remplace `services/rental/app/signing.py` par un import d'alias (`import semsar_signing as signing`). La logique métier (placement des champs, signataires, PDF — `_sig_context_by_agency`) **reste dans rental** : la lib est un transport 3a9dSign pur.

**Tech Stack:** Python 3.11+, httpx, packaging setuptools (mêmes conventions que `libs/semsar_events`).

## Global Constraints

- Python `>=3.11`. Driver/HTTP : `httpx`.
- Le secret `SIGN_API_KEY` n'est **jamais loggé** (déjà respecté dans le code source).
- Aucune régression : rental doit continuer d'émettre `rental.lease.signed` / signer via 3a9dSign à l'identique.
- Conventional Commits ; une seule modification logique par commit ; **pas** d'attribution IA.
- Gate qualité avant « done » : lint + format + typecheck + tests + build verts (`make check` si exposé).

---

### Task 1 : Créer le squelette de la lib `semsar_signing`

**Files:**
- Create: `libs/semsar_signing/pyproject.toml`
- Create: `libs/semsar_signing/semsar_signing/__init__.py`
- Create: `libs/semsar_signing/semsar_signing/client.py`
- Test: `libs/semsar_signing/tests/test_client.py`

**Interfaces:**
- Produces (module `semsar_signing`, ré-exporté depuis `client.py`) :
  - `SigningError(Exception)`
  - `signing_enabled() -> bool`
  - `create_envelope(title: str, external_reference: str) -> str`
  - `add_document(env_id: str, filename: str, pdf_bytes: bytes) -> tuple[str, int]`
  - `add_recipient(env_id: str, email: str, name: str, routing_order: int) -> str`
  - `place_signature_field(env_id, document_id, recipient_id, page: int, x: float, y: float) -> None`
  - `send_envelope(env_id: str) -> None`
  - `get_status(env_id: str) -> str`
  - `fetch_signed_pdf(env_id: str, document_id: str) -> bytes`

- [ ] **Step 1 : Écrire le test qui échoue** (`libs/semsar_signing/tests/test_client.py`)

```python
import semsar_signing as signing


def test_signing_disabled_without_key(monkeypatch):
    monkeypatch.delenv("SIGN_API_KEY", raising=False)
    assert signing.signing_enabled() is False


def test_signing_enabled_with_key(monkeypatch):
    monkeypatch.setenv("SIGN_API_KEY", "secret-123")
    assert signing.signing_enabled() is True


def test_create_envelope_posts_and_returns_id(monkeypatch):
    monkeypatch.setenv("SIGN_API_KEY", "secret-123")
    captured = {}

    class _Resp:
        status_code = 200

        def json(self):
            return {"id": "env-42"}

    class _FakeClient:
        def __init__(self, *a, **k):
            captured["headers"] = k.get("headers")

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, path, json=None, **k):
            captured["path"] = path
            captured["json"] = json
            return _Resp()

    monkeypatch.setattr(signing, "httpx", type("m", (), {"Client": _FakeClient}))
    env_id = signing.create_envelope("Bail 123", "rental:lease:1:9")
    assert env_id == "env-42"
    assert captured["path"] == "/envelopes"
    assert captured["json"]["external_reference"] == "rental:lease:1:9"
    assert captured["headers"] == {"X-API-Key": "secret-123"}
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd libs/semsar_signing && python -m pytest tests/test_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'semsar_signing'`.

- [ ] **Step 3 : Créer `client.py`** — copie VERBATIM du contenu actuel de `services/rental/app/signing.py` :

```python
"""Client 3a9dSign (signature électronique). Auth = en-tête X-API-Key (clé en env, jamais loggée)."""
import os

import httpx


class SigningError(Exception):
    pass


def _base() -> str:
    return os.environ.get("SIGN_API_URL", "http://localhost:18000/api/v1").rstrip("/")


def _key() -> str:
    return os.environ.get("SIGN_API_KEY", "")


def signing_enabled() -> bool:
    return bool(_key())


def _headers() -> dict:
    return {"X-API-Key": _key()}


def _client() -> httpx.Client:
    return httpx.Client(base_url=_base(), headers=_headers(), timeout=20.0)


def create_envelope(title: str, external_reference: str) -> str:
    with _client() as c:
        r = c.post("/envelopes", json={"title": title[:255], "routing_mode": "sequential",
                                       "external_reference": external_reference})
    if r.status_code >= 300:
        raise SigningError(f"create_envelope {r.status_code}")
    return r.json()["id"]


def add_document(env_id: str, filename: str, pdf_bytes: bytes):
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/documents",
                   files={"file": (filename, pdf_bytes, "application/pdf")})
    if r.status_code >= 300:
        raise SigningError(f"add_document {r.status_code}")
    d = r.json()
    return d["id"], int(d.get("page_count") or 1)


def add_recipient(env_id: str, email: str, name: str, routing_order: int) -> str:
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/recipients",
                   json={"email": email, "name": name, "role": "signer", "routing_order": routing_order})
    if r.status_code >= 300:
        raise SigningError(f"add_recipient {r.status_code}")
    return r.json()["id"]


def place_signature_field(env_id: str, document_id: str, recipient_id: str, page: int, x: float, y: float) -> None:
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/fields",
                   json={"document_id": document_id, "recipient_id": recipient_id,
                         "field_type": "signature", "page": page, "x": x, "y": y,
                         "width": 150, "height": 40, "required": True})
    if r.status_code >= 300:
        raise SigningError(f"place_field {r.status_code}")


def send_envelope(env_id: str) -> None:
    with _client() as c:
        r = c.post(f"/envelopes/{env_id}/send", json={"confirm": True})
    if r.status_code >= 300:
        raise SigningError(f"send {r.status_code}")


def get_status(env_id: str) -> str:
    with _client() as c:
        r = c.get(f"/envelopes/{env_id}")
    if r.status_code >= 300:
        raise SigningError(f"get_status {r.status_code}")
    return r.json().get("status", "")


def fetch_signed_pdf(env_id: str, document_id: str) -> bytes:
    with _client() as c:
        r = c.get(f"/envelopes/{env_id}/documents/{document_id}/download")
        if r.status_code >= 300:
            raise SigningError(f"download {r.status_code}")
        url = r.json()["url"]
        url = url.replace("http://minio:9000", os.environ.get("S3_ENDPOINT_URL", "http://localhost:9000"))
        rr = httpx.get(url, timeout=30.0)
    if rr.status_code >= 300:
        raise SigningError(f"download_bytes {rr.status_code}")
    return rr.content
```

- [ ] **Step 4 : Créer `__init__.py`** (ré-export complet) :

```python
"""Client 3a9dSign partagé (transport pur ; la logique métier reste dans chaque service)."""
from .client import (
    SigningError,
    add_document,
    add_recipient,
    create_envelope,
    fetch_signed_pdf,
    get_status,
    place_signature_field,
    send_envelope,
    signing_enabled,
)

__all__ = [
    "SigningError",
    "signing_enabled",
    "create_envelope",
    "add_document",
    "add_recipient",
    "place_signature_field",
    "send_envelope",
    "get_status",
    "fetch_signed_pdf",
]
```

- [ ] **Step 5 : Créer `pyproject.toml`** (calqué sur `libs/semsar_events`) :

```toml
[project]
name = "semsar-signing"
version = "0.1.0"
description = "Client 3a9dSign (signature électronique) partagé entre services SemsarOut."
requires-python = ">=3.11"
dependencies = ["httpx>=0.27"]

[project.optional-dependencies]
test = ["pytest>=8.0"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
packages = ["semsar_signing"]
```

- [ ] **Step 6 : Installer la lib en editable et lancer les tests**

Run:
```bash
pip install -e libs/semsar_signing
cd libs/semsar_signing && python -m pytest tests/test_client.py -v
```
Expected: 3 PASS.

- [ ] **Step 7 : Commit**

```bash
git add libs/semsar_signing
git commit -m "feat(signing): lib partagée semsar_signing (client 3a9dSign extrait)"
```

---

### Task 2 : Basculer rental sur la lib partagée

**Files:**
- Delete: `services/rental/app/signing.py`
- Modify: `services/rental/app/main.py:22` (import)
- Modify: `services/rental/pyproject.toml` (ajout dépendance `semsar-signing`)
- Test: `services/rental/tests/test_signing_import.py`

**Interfaces:**
- Consumes: le module `semsar_signing` (Task 1) — mêmes symboles que l'ancien `signing`.
- rental continue d'utiliser `signing.signing_enabled/create_envelope/add_document/add_recipient/place_signature_field/send_envelope/get_status/fetch_signed_pdf/SigningError` via l'alias `signing`.

- [ ] **Step 1 : Écrire le test qui échoue** (`services/rental/tests/test_signing_import.py`)

```python
def test_rental_uses_shared_signing_lib():
    from app import main
    import semsar_signing
    # main.signing doit être la lib partagée, pas un module local rental.
    assert main.signing is semsar_signing
    assert hasattr(main.signing, "create_envelope")
    assert main.signing.signing_enabled.__module__ == "semsar_signing.client"
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd services/rental && python -m pytest tests/test_signing_import.py -v`
Expected: FAIL — `main.signing` pointe encore vers `app.signing` (module local), l'assert `is semsar_signing` échoue.

- [ ] **Step 3 : Modifier l'import dans `services/rental/app/main.py`**

Remplacer la ligne 22 :
```python
from . import events, signing
```
par :
```python
import semsar_signing as signing

from . import events
```
(le reste du fichier — `signing.create_envelope(...)`, `signing.SigningError`, etc. — est inchangé car l'alias `signing` est conservé.)

- [ ] **Step 4 : Supprimer le module local**

Run: `git rm services/rental/app/signing.py`

- [ ] **Step 5 : Ajouter la dépendance dans `services/rental/pyproject.toml`**

Dans la liste `dependencies`, ajouter `"semsar-signing"` à côté de `"semsar-events"`.

- [ ] **Step 6 : Lancer les tests rental (import + smoke existants)**

Run:
```bash
pip install -e libs/semsar_signing
cd services/rental && python -m pytest tests/ -v
```
Expected: PASS (le nouveau test + les smoke tests `test_health_ok` existants).

- [ ] **Step 7 : Vérifier qu'aucun autre fichier ne référence l'ancien module**

Run: `grep -rn "app.signing\|from . import.*signing\|from \.signing" services/rental/app/`
Expected: aucune occurrence résiduelle (seul `import semsar_signing as signing` doit rester).

- [ ] **Step 8 : Commit**

```bash
git add services/rental
git commit -m "refactor(rental): utiliser la lib semsar_signing au lieu du module local"
```

---

### Task 3 : Câbler l'installation de la lib dans le mesh de dev

**Files:**
- Modify: `scripts/dev-mesh-up.sh` (installation des libs editable, si une étape d'install de libs existe)

**Interfaces:** aucune (opérationnel).

- [ ] **Step 1 : Repérer l'installation des libs**

Run: `grep -n "pip install -e libs" scripts/dev-mesh-up.sh`
Expected : une ou plusieurs lignes installant `libs/semsar_common`, `libs/semsar_events`, etc.

- [ ] **Step 2 : Ajouter `libs/semsar_signing`**

Ajouter `pip install -e libs/semsar_signing` à la suite des autres installs de libs (même ligne/boucle). Si l'install se fait via une boucle sur un tableau de libs, y ajouter `semsar_signing`.

- [ ] **Step 3 : Vérifier le démarrage**

Run: `bash scripts/dev-mesh-up.sh` puis `curl -s localhost:8518/health`
Expected: `{"status":"ok","service":"rental"}` — rental démarre avec la lib installée.

- [ ] **Step 4 : Commit**

```bash
git add scripts/dev-mesh-up.sh
git commit -m "chore(mesh): installer semsar_signing en editable au bring-up"
```

---

## Self-Review

- **Couverture spec** : §2 (lib `semsar_signing`), §5.4 (client e-sign partagé rental+selling) → Tasks 1-2. La consommation par `selling` est au Plan P1-5.
- **Placeholders** : aucun ; tout le code est présent verbatim.
- **Cohérence des types** : les 9 symboles exportés par `__init__.py` (Task 1) correspondent exactement à ceux utilisés par rental via l'alias `signing` (Task 2).
