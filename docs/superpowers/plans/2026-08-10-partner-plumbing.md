# Service `partner` — Plomberie plateforme (Plan 2/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Câbler le service `partner` (déjà livré, plan 1) dans la plateforme : routage gateway `/api/v1/partner*`, fan-out reporting dans `backoffice_overview`, dev-mesh (port 8525 + relay/worker), CI, et ansible prod.

**Architecture:** On suit les patrons EXACTS déjà en place pour `coloc-listing`/`matching` (config `X_url`, `app.state.X`, branche `_resolve_upstream`, `backoffice_overview` fan-out, `dev-mesh-up.sh` SVCS, `ci.yml` liste ALL, ansible `mesh/vars`).

**Tech Stack:** FastAPI gateway (httpx), bash (dev-mesh), GitHub Actions YAML, Ansible YAML, pytest (gateway).

## Global Constraints

- Suivre les patrons existants sans réinventer. Aucune règle `_resolve_upstream` ne doit masquer/être masquée par une autre (ordre + `settings.X_url and <match>`).
- Dégradation propre : `backoffice_overview` ne tombe jamais si partner est absent (sous-clé `null`, patron `_fetch_internal_stats`).
- Pas de secret en dur ; pas d'attribution IA.

---

## Task 1: Routage gateway `/api/v1/partner*`

**Files:**
- Modify: `gateway/app/config.py` (partner_url)
- Modify: `gateway/app/main.py` (lifespan state + close, `_resolve_upstream` branche)
- Modify: `gateway/.env.example` (PARTNER_URL, si présent)
- Test: `gateway/tests/test_partner_routes.py`

**Interfaces:**
- Produces: `settings.partner_url`, `app.state.partner`, routage de `/api/v1/partner*` → service partner (préfixe réécrit `/api/v1` → ``).

- [ ] **Step 1: Test (rouge)** — `gateway/tests/test_partner_routes.py`, sur le patron de `gateway/tests/test_coloc_routes.py` : monkeypatch `settings.partner_url`, un `httpx.MockTransport` sur `app.state.partner` qui renvoie 200, un `_resolve_identity` mocké (user m3a-l3achrane), et assert que `GET /api/v1/partner/affilies` atteint le client partner (200) et que le chemin reçu est `/partner/affilies`.

- [ ] **Step 2: config** — `gateway/app/config.py`, à côté de `coloc_listing_url` : `partner_url: str | None = None`.

- [ ] **Step 3: lifespan** — `gateway/app/main.py` : `app.state.partner = _client_or_none(settings.partner_url)` dans `lifespan` (avant `yield`, à côté de `app.state.coloc_listing`), et l'ajouter au tuple de fermeture après `yield`.

- [ ] **Step 4: `_resolve_upstream` branche** — après la branche `coloc_listing` (et avant le catch-all `return None, path`) :
```python
    if settings.partner_url and (
        path == "/api/v1/partner" or path.startswith("/api/v1/partner/")
    ):
        return app.state.partner, path.replace("/api/v1", "", 1)
```

- [ ] **Step 5: `.env.example`** — ajouter `PARTNER_URL=` (commenté, comme les autres services optionnels) si le fichier liste les URLs de services.

- [ ] **Step 6: Lancer → vert + commit**

Run: `cd gateway && python -m pytest tests/test_partner_routes.py -v`
Expected: PASS.
```bash
git add gateway
git commit -m "feat(gateway): route /api/v1/partner* vers le service partner"
```

---

## Task 2: Fan-out reporting dans `backoffice_overview`

**Files:**
- Modify: `gateway/app/main.py` (`backoffice_overview`)
- Test: `gateway/tests/test_backoffice_overview_partner.py` (ou étendre le test overview existant)

**Interfaces:** `backoffice_overview` inclut une sous-clé `partners` = `/internal/stats` du service partner (dégradation `null` si absent).

- [ ] **Step 1: Test (rouge)** — vérifie que la réponse de `GET /api/v1/backoffice/overview` (superadmin m3a) contient une clé `partners` alimentée par `app.state.partner` `/internal/stats` (mock 200), et que si `app.state.partner is None` la clé vaut `null` sans faire échouer l'overview.

- [ ] **Step 2: Implémenter** — dans `backoffice_overview`, ajouter au `asyncio.gather` un `_fetch_internal_stats(app_.state.partner, "/internal/stats", tenant, headers)` et l'exposer sous `"partners"` dans le `JSONResponse`.

- [ ] **Step 3: Lancer → vert + commit**
```bash
git commit -am "feat(gateway): fan-out partner dans backoffice_overview (dégradation propre)"
```

---

## Task 3: dev-mesh + CI + ansible

**Files:**
- Modify: `scripts/dev-mesh-up.sh`
- Modify: `.github/workflows/ci.yml`
- Modify: `infra/prod/ansible/roles/mesh/vars/main.yml`

**Interfaces:** le service partner est lancé en dev (uvicorn :8525 + relay + worker), testé en CI (matrice), et déployé en prod (systemd).

- [ ] **Step 1: dev-mesh-up.sh** — ajouter `partner:8525` à la variable `SVCS` ; ajouter `partner` aux boucles relay + worker (là où coloc-listing est lancé `-m app.relay`/`-m app.worker`) ; poser `PARTNER_URL=http://localhost:8525` dans le bloc d'env du BFF (à côté de `COLOC_LISTING_URL`). Vérifier la cohérence (pas de collision de port 8525).

- [ ] **Step 2: ci.yml** — ajouter `services/partner` à la liste `ALL` (ligne ~43-48). Rien d'autre (matrice dynamique).

- [ ] **Step 3: ansible mesh** — `infra/prod/ansible/roles/mesh/vars/main.yml` : ajouter `{ name: partner, port: 8525 }` à `mesh_apps` ; ajouter `partner` à `mesh_relays` et `mesh_workers`. (Ne pas mettre `no_db: true` — le service a une DB.)

- [ ] **Step 4: Vérifs syntaxe + commit**

Run:
```bash
bash -n scripts/dev-mesh-up.sh
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); yaml.safe_load(open('infra/prod/ansible/roles/mesh/vars/main.yml')); print('YAML OK')"
```
Expected: pas d'erreur de syntaxe bash + `YAML OK`.
```bash
git add scripts/dev-mesh-up.sh .github/workflows/ci.yml infra/prod/ansible/roles/mesh/vars/main.yml
git commit -m "chore(mesh): enrôle le service partner (dev-mesh, CI, ansible)"
```

---

## Self-review coverage (spec → tâches)

- Gateway routing `/api/v1/partner*` + config → T1. Fan-out reporting `backoffice_overview` → T2. dev-mesh (port 8525 + relay/worker + PARTNER_URL) + CI (ALL) + ansible (mesh_apps/relays/workers) → T3.
- HORS de ce plan (plan 3) : tout le frontend (services + écrans interactifs + reporting graphique + i18n).
