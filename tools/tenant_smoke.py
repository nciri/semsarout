#!/usr/bin/env python3
"""Smoke d'isolation tenant m3a-l3achrane ⇄ semsar via le BFF (dev).

Usage : python tools/tenant_smoke.py --bff http://localhost:8099
Prérequis : mesh monté (scripts/dev-mesh-up.sh), migration identity add_tenant.sql
appliquée, BFF en environment=dev (en-tête x-tenant honoré).
"""
import argparse
import sys
import time

import requests

M3A = {"x-tenant": "m3a-l3achrane"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bff", default="http://localhost:8099")
    args = parser.parse_args()
    base = args.bff.rstrip("/") + "/api/v1"
    email = f"smoke-tenant-{int(time.time())}@test.ma"
    reg = {"email": email, "password": "smoke-pass-123",
           "first_name": "Smoke", "last_name": "Tenant"}
    failures = []

    def check(name, cond, detail=""):
        print(f"  {'OK ' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))
        if not cond:
            failures.append(name)

    # 1. Inscription côté m3a-l3achrane
    r = requests.post(f"{base}/auth/register", json=reg, headers=M3A, timeout=10)
    check("register m3a-l3achrane → 201", r.status_code == 201, r.text[:200])
    token = r.json().get("access_token", "") if r.status_code == 201 else ""

    # 2. Login OK sur m3a-l3achrane, refusé sur semsar (compte inexistant sur ce tenant)
    creds = {"email": email, "password": reg["password"]}
    r = requests.post(f"{base}/auth/login", json=creds, headers=M3A, timeout=10)
    check("login m3a-l3achrane → 200", r.status_code == 200, r.text[:200])
    r = requests.post(f"{base}/auth/login", json=creds, timeout=10)
    check("login semsar (même email) → 401", r.status_code == 401, r.text[:200])

    # 3. Jeton m3a-l3achrane refusé sur une route semsar (et l'inverse par symétrie)
    r = requests.get(f"{base}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    check("jeton m3a-l3achrane sans x-tenant → 403 Tenant mismatch", r.status_code == 403, r.text[:200])
    r = requests.get(f"{base}/auth/me", headers={"Authorization": f"Bearer {token}", **M3A}, timeout=10)
    check("jeton m3a-l3achrane sur tenant m3a-l3achrane → 200", r.status_code == 200, r.text[:200])

    print("\n" + ("SMOKE TENANT : OK" if not failures else f"SMOKE TENANT : {len(failures)} échec(s)"))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
