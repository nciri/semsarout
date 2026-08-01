#!/usr/bin/env python3
"""Smoke bout-en-bout annonces coloc : création → modération → indexation → recherche.

Usage : python3 tools/coloc_smoke.py --bff http://localhost:8099 --coloc http://localhost:8521
Prérequis : mesh monté, schéma coloc_listing appliqué, relay coloc-listing + worker search actifs.
La modération (approve) passe en DIRECT sur le service (en-têtes x-semsar-* forgés,
TRUST_GATEWAY_HEADERS=true en dev) : il n'existe pas encore de compte superadmin
m3a-l3achrane — voir « hors périmètre » du plan.
"""
import argparse
import sys
import time

import requests

M3A = {"x-tenant": "m3a-l3achrane"}
PAYLOAD = {
    "property": {"city": "Fès", "neighborhood": "Ville Nouvelle",
                 "property_type": "APPARTEMENT", "area_m2": 70, "amenities": {"wifi": True}},
    "title": "Smoke — chambre à Fès", "description": "Annonce du smoke test.",
    "bed_type": "CHAMBRE_INDIVIDUELLE", "rent": "1700.00",
    "housing_gender": "FEMININ", "furnished": True, "capacity": 2,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bff", default="http://localhost:8099")
    parser.add_argument("--coloc", default="http://localhost:8521")
    args = parser.parse_args()
    base = args.bff.rstrip("/") + "/api/v1"
    failures = []

    def check(name, cond, detail=""):
        print(f"  {'OK ' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))
        if not cond:
            failures.append(name)

    # 1. Compte m3a-l3achrane + création d'annonce via le BFF
    email = f"smoke-coloc-{int(time.time())}@test.ma"
    reg = requests.post(f"{base}/auth/register", headers=M3A, timeout=10,
                        json={"email": email, "password": "smoke-pass-123",
                              "first_name": "Smoke", "last_name": "Coloc"})
    check("register m3a-l3achrane → 201", reg.status_code == 201, reg.text[:200])
    token = reg.json().get("access_token", "")
    auth = {"Authorization": f"Bearer {token}", **M3A}

    r = requests.post(f"{base}/listings", json=PAYLOAD, headers=auth, timeout=10)
    check("POST /listings (BFF) → 201", r.status_code == 201, r.text[:200])
    lid = r.json().get("id", "")

    r = requests.post(f"{base}/listings/{lid}/submit", headers=auth, timeout=10)
    check("submit → EN_MODERATION", r.status_code == 200 and r.json().get("status") == "EN_MODERATION",
          r.text[:200])

    # 2. Modération en direct service (superadmin forgé — dev uniquement)
    admin = {"x-semsar-user-id": "1", "x-semsar-superadmin": "1", "x-semsar-tenant": "m3a-l3achrane"}
    r = requests.post(f"{args.coloc}/listings/{lid}/approve", headers=admin, timeout=10)
    check("approve (superadmin direct) → PUBLIEE",
          r.status_code == 200 and r.json().get("status") == "PUBLIEE", r.text[:200])

    # 3. Détail public via le BFF
    r = requests.get(f"{base}/listings/{lid}", headers=M3A, timeout=10)
    check("GET /listings/{id} public → 200", r.status_code == 200, r.text[:200])
    check("détail sans adresse", "address" not in r.json())

    # 4. Indexation → recherche (relay + worker : on attend jusqu'à 20 s)
    found = False
    for _ in range(20):
        r = requests.get(f"{base}/listings", params={"city": "Fès", "q": "Smoke"},
                         headers=M3A, timeout=10)
        if r.status_code == 200 and any(i["listing_id"] == lid for i in r.json().get("items", [])):
            found = True
            break
        time.sleep(1)
    check("annonce indexée et trouvée via GET /listings", found)

    # 5. Archive → désindexation
    r = requests.post(f"{base}/listings/{lid}/archive", headers=auth, timeout=10)
    check("archive → 200", r.status_code == 200, r.text[:200])
    gone = False
    for _ in range(20):
        r = requests.get(f"{base}/listings", params={"city": "Fès", "q": "Smoke"},
                         headers=M3A, timeout=10)
        if all(i["listing_id"] != lid for i in r.json().get("items", [])):
            gone = True
            break
        time.sleep(1)
    check("annonce désindexée après archivage", gone)

    print("\n" + ("SMOKE COLOC : OK" if not failures else f"SMOKE COLOC : {len(failures)} échec(s)"))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
