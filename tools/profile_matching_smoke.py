#!/usr/bin/env python3
"""Smoke profil & matching : inscription → profil → lifestyle → scores → invalidation.

Usage : python3 tools/profile_matching_smoke.py --bff http://localhost:8099
Prérequis : mesh complet (plans A/B/C), annonces de démo seedées (codes canoniques).
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
    failures = []

    def check(name, cond, detail=""):
        print(f"  {'OK ' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))
        if not cond:
            failures.append(name)

    def get_scores(auth):
        for _ in range(20):
            r = requests.get(f"{base}/listings", params={"city": "Casablanca"},
                             headers=auth, timeout=10)
            items = r.json().get("items", [])
            if any("match_pct" in i for i in items):
                return items
            time.sleep(1)
        return items

    email = f"smoke-match-{int(time.time())}@test.ma"
    reg = requests.post(f"{base}/auth/register", headers=M3A, timeout=10,
                        json={"email": email, "password": "smoke-pass-123",
                              "first_name": "Nadia", "last_name": "Smoke"})
    check("register → 201", reg.status_code == 201, reg.text[:200])
    auth = {"Authorization": f"Bearer {reg.json().get('access_token', '')}", **M3A}

    # GET /me/profile crée paresseusement une ligne vide (ensure_profile) : on
    # reboucle jusqu'à ce que le worker user.* ait synchronisé display_name,
    # pas juste jusqu'au premier 200 (sinon on lit la ligne vide créée à la volée).
    profile = None
    for _ in range(15):
        r = requests.get(f"{base}/me/profile", headers=auth, timeout=10)
        if r.status_code == 200:
            profile = r.json()
            if profile.get("display_name") == "Nadia":
                break
        time.sleep(1)
    check("GET /me/profile → 200", profile is not None)
    check("display_name synchronisé par le worker", (profile or {}).get("display_name") == "Nadia")

    # Profil scorable + lifestyle
    r = requests.put(f"{base}/me/profile", headers=auth, timeout=10,
                     json={"gender": "FEMME", "city": "Casablanca",
                           "budget_min": "1000.00", "budget_max": "2500.00"})
    check("PUT /me/profile → 200", r.status_code == 200, r.text[:200])
    r = requests.put(f"{base}/me/lifestyle", headers=auth, timeout=10,
                     json={"answers": [{"question_code": "tabac", "value": "non_fumeur",
                                        "importance": "DECISIF"}]})
    check("PUT /me/lifestyle → 200", r.status_code == 200, r.text[:200])

    # Scores réels sur la recherche authentifiée (Casablanca FEMININ ≤ 2500 → match)
    items = get_scores(auth)
    scored = [i for i in items if "match_pct" in i]
    check("au moins une annonce avec match_pct", len(scored) >= 1)
    check("scores entiers 1-100", all(isinstance(i["match_pct"], int)
                                      and 0 < i["match_pct"] <= 100 for i in scored))
    # L'anonyme ne voit aucun score
    r = requests.get(f"{base}/listings", params={"city": "Casablanca"}, headers=M3A, timeout=10)
    check("anonyme sans match_pct", all("match_pct" not in i for i in r.json().get("items", [])))

    # Favoris
    lid = items[0]["listing_id"]
    check("POST favori → 204", requests.post(f"{base}/me/favorites", json={"listing_id": lid},
                                             headers=auth, timeout=10).status_code == 204)
    favs = requests.get(f"{base}/me/favorites", headers=auth, timeout=10).json()
    check("favori listé", any(f["listing_id"] == lid for f in favs))
    check("DELETE favori → 204", requests.delete(f"{base}/me/favorites/{lid}",
                                                 headers=auth, timeout=10).status_code == 204)

    # Invalidation : déménager à Rabat → les scores Casablanca disparaissent (hard-fail ville)
    requests.put(f"{base}/me/profile", json={"city": "Rabat"}, headers=auth, timeout=10)
    gone = False
    for _ in range(20):
        r = requests.get(f"{base}/listings", params={"city": "Casablanca"},
                         headers=auth, timeout=10)
        if all("match_pct" not in i for i in r.json().get("items", [])):
            gone = True
            break
        time.sleep(1)
    check("invalidation après changement de ville", gone)

    print("\n" + ("SMOKE PROFIL/MATCHING : OK" if not failures
                  else f"SMOKE PROFIL/MATCHING : {len(failures)} échec(s)"))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
