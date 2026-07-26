#!/usr/bin/env python3
"""Tests de contrat v2 — parité BFF→service vs monolithe, route par route (LECTURE seule).

Ne concerne QUE les services qui reroutent des routes EXISTANTES du front
(catalog, directory, listing, search, marketplace, crm). Les services additifs
(identity, contract, legal, payment, billing, analytics, notification) exposent de
NOUVELLES surfaces sans équivalent monolithe → pas de parité à tester (smoke only).

Usage :
    python tools/contract_test.py --monolith http://localhost:7000 \
        --bff http://localhost:8080 --token "$JWT" --services catalog,directory
    # --services all  pour tout ; --property-id / --lead-id pour les routes détail

Prérequis : le BFF doit avoir le(s) *_URL du/des service(s) testé(s) activés, et les
données migrées (mêmes id des deux côtés). Voir docs/architecture-v2-bringup.md.
"""
import argparse
import json
import sys

import requests

# Champs volatils ignorés dans la comparaison (ex. le compteur de vues s'incrémente à chaque GET).
VOLATILE = {"views_count"}


def normalize(obj):
    if isinstance(obj, dict):
        return {k: normalize(v) for k, v in sorted(obj.items()) if k not in VOLATILE}
    if isinstance(obj, list):
        items = [normalize(v) for v in obj]
        # Collections d'entités par `id` (ex. `members` de /my-agency) : le monolithe ne garantit
        # PAS l'ordre (relations sans ORDER BY) → comparaison ordre-insensible par id.
        if items and all(isinstance(v, dict) and "id" in v for v in items):
            items = sorted(items, key=lambda v: str(v.get("id")))
        return items
    return obj


def cases(args):
    pid = args.property_id
    return {
        "catalog": [
            ("GET", "/api/v1/backoffice/shop/categories", None, None),
            ("GET", "/api/v1/backoffice/shop/products", {"group": "furniture"}, None),
            ("GET", "/api/v1/admin/products", None, None),
        ],
        "directory": [
            ("GET", "/api/v1/backoffice/artisan-trades", None, None),
            ("GET", "/api/v1/backoffice/artisans", None, None),
            ("GET", "/api/v1/backoffice/work-orders", None, None),
            ("GET", "/api/v1/admin/shared-artisans", None, None),
        ],
        "listing": [
            ("GET", "/api/v1/my-properties", None, None),
            *([("GET", f"/api/v1/properties/{pid}", None, None)] if pid else []),
        ],
        "search": [
            ("GET", "/api/v1/properties", None, None),
            ("GET", "/api/v1/properties", {"transaction_type": "sale"}, None),
            ("GET", "/api/v1/properties/suggestions", {"q": "Cas"}, None),
            ("POST", "/api/v1/properties/search", None, {"filters": {"transaction_type": "sale"}, "page": 1}),
        ],
        "marketplace": [
            ("GET", "/api/v1/backoffice/shop/cart", None, None),
            ("GET", "/api/v1/backoffice/shop/orders", None, None),
            ("GET", "/api/v1/admin/orders", None, None),
        ],
        "messaging": [
            ("GET", "/api/v1/buyer/messages", None, None),
        ],
        # identity RBAC (lecture) : rôles & permissions
        "rbac": [
            ("GET", "/api/v1/backoffice/roles", None, None),
            ("GET", "/api/v1/backoffice/permissions", None, None),
        ],
        "dashboard-config": [
            ("GET", "/api/v1/backoffice/dashboard/config", None, None),
        ],
        # trust-safety : mutations super-admin (agent1 → 403 des deux côtés).
        "trust-safety": [
            ("POST", "/api/v1/admin/accounts/users/999999/suspend", None, {}),
            ("POST", "/api/v1/admin/accounts/agencies/999999/unsuspend", None, {}),
        ],
        "audit": [
            ("GET", "/api/v1/admin/activity", None, None),
        ],
        "agency": [
            ("GET", "/api/v1/agencies", None, None),
            ("GET", "/api/v1/agencies/immo-casa-premium", None, None),
            ("GET", "/api/v1/my-agency", None, None),
            ("GET", "/api/v1/agencies/immo-casa-premium/properties", None, None),
        ],
        "geo": [
            *([("GET", f"/api/v1/properties/{pid}/price-position", None, None)] if pid else []),
            ("GET", "/api/v1/market/neighborhood-prices", None, None),
        ],
        "transactions": [
            ("GET", "/api/v1/backoffice/transactions", None, None),
            ("GET", "/api/v1/backoffice/transactions", {"type": "sale"}, None),
            ("GET", "/api/v1/backoffice/transactions", {"status": "won"}, None),
            ("GET", "/api/v1/backoffice/transactions/pipeline", {"type": "sale"}, None),
            ("GET", "/api/v1/backoffice/transactions/pipeline", {"type": "rent"}, None),
            ("GET", "/api/v1/backoffice/transactions/stats", None, None),
            ("GET", "/api/v1/backoffice/transactions/stages", {"type": "sale"}, None),
            ("GET", "/api/v1/backoffice/transactions/stages", {"type": "rent"}, None),
        ],
        "buyer": [
            ("GET", "/api/v1/buyer/saved-searches", None, None),
            ("GET", "/api/v1/buyer/favorites", None, None),
            ("GET", "/api/v1/buyer/estimates", None, None),
        ],
        "payment": [
            ("GET", "/api/v1/my-payments", None, None),
            ("POST", "/api/v1/payments/create-intent", None, {}),
            ("POST", "/api/v1/payments/create-intent", None, {"service_id": "nope"}),
            ("GET", "/api/v1/payments/PAY-DOESNOTEXIST", None, None),
        ],
        "billing": [
            ("GET", "/api/v1/subscription-plans", None, None),
            ("GET", "/api/v1/subscription-plans/1", None, None),
            ("GET", "/api/v1/my-subscription", None, None),
            ("GET", "/api/v1/subscription/current", None, None),
        ],
        "contract": [
            ("GET", "/api/v1/backoffice/contract-templates", None, None),
            ("GET", "/api/v1/backoffice/contracts", None, None),
            ("GET", "/api/v1/backoffice/contracts", {"status": "draft"}, None),
        ],
        "legal": [
            ("GET", "/api/v1/backoffice/notaries", None, None),
            ("GET", "/api/v1/backoffice/legal-cases", None, None),
            ("GET", "/api/v1/backoffice/legal-cases", {"status": "open"}, None),
            *([("GET", f"/api/v1/backoffice/legal-cases/{args.legal_case_id}", None, None)]
              if args.legal_case_id else []),
        ],
        "crm": [
            ("GET", "/api/v1/backoffice/leads", None, None),
            ("GET", "/api/v1/backoffice/leads/stats", None, None),
            ("GET", "/api/v1/backoffice/leads/agents", None, None),
            ("GET", "/api/v1/backoffice/clients", None, None),
            ("GET", "/api/v1/backoffice/clients/stats", None, None),
            ("GET", "/api/v1/backoffice/visits", None, None),
            ("GET", "/api/v1/backoffice/visits/calendar", None, None),
        ],
    }


def call(base, method, path, params, body, headers):
    try:
        r = requests.request(method, base + path, params=params, json=body, headers=headers, timeout=15)
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, r.text
    except requests.RequestException as exc:
        return None, f"<request error: {exc}>"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--monolith", required=True)
    p.add_argument("--bff", required=True)
    p.add_argument("--token", required=True)
    p.add_argument("--services", default="all")
    p.add_argument("--property-id", type=int, default=None)
    p.add_argument("--lead-id", type=int, default=None)
    p.add_argument("--legal-case-id", type=int, default=None)
    args = p.parse_args()

    all_cases = cases(args)
    services = list(all_cases) if args.services == "all" else args.services.split(",")
    headers = {"Authorization": f"Bearer {args.token}", "Content-Type": "application/json"}

    total = passed = 0
    for svc in services:
        svc = svc.strip()
        if svc not in all_cases:
            print(f"?? service inconnu (pas de parité à tester) : {svc}")
            continue
        print(f"\n=== {svc} ===")
        for method, path, params, body in all_cases[svc]:
            total += 1
            s_mono, b_mono = call(args.monolith, method, path, params, body, headers)
            s_bff, b_bff = call(args.bff, method, path, params, body, headers)
            same_status = s_mono == s_bff
            same_body = normalize(b_mono) == normalize(b_bff)
            if same_status and same_body:
                passed += 1
                print(f"  PASS  {method} {path}  ({s_mono})")
            else:
                print(f"  DIFF  {method} {path}  monolithe={s_mono} bff={s_bff}")
                if not same_status:
                    print(f"        statut différent")
                if not same_body:
                    mono_s = json.dumps(normalize(b_mono), ensure_ascii=False)[:300]
                    bff_s = json.dumps(normalize(b_bff), ensure_ascii=False)[:300]
                    print(f"        monolithe: {mono_s}")
                    print(f"        bff      : {bff_s}")

    print(f"\n----\n{passed}/{total} PASS")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
