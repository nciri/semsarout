#!/usr/bin/env python3
"""Garde-fou : détecte les URLs de service mal recopiées dans les .env.example
(cf. bug trouvé lors de l'audit e-signature du 2026-08-30 : services/selling/.env.example
pointait SIGN_API_URL vers le port d'identity au lieu de 3a9dSign)."""
import re
import sys
from pathlib import Path

# Ports de référence connus (mesh local, cf. scripts/dev-mesh-up.sh) — noms de service
# EXACTS attendus dans le nom de variable pour ce port.
KNOWN_PORTS = {
    "8501": "identity", "8502": "notification", "8504": "analytics", "8505": "contract",
    "8506": "legal", "8507": "payment", "8508": "billing", "8509": "geo",
    "8510": "messaging", "8511": "trust-safety", "8512": "agency", "8513": "audit",
    "8514": "transactions", "8515": "buyer", "8516": "programs", "8517": "staymanager",
    "8518": "rental", "8519": "commission", "8520": "selling", "8521": "coloc-listing",
    "8522": "coloc-profile", "8523": "matching", "8524": "translation", "8525": "partner",
}

URL_RE = re.compile(r"^([A-Z0-9_]+)_URL=https?://[^:/]+:(\d+)")


def check_file(path: Path) -> list[str]:
    errors = []
    for line in path.read_text().splitlines():
        m = URL_RE.match(line.strip())
        if not m:
            continue
        var_name, port = m.groups()
        expected_service = KNOWN_PORTS.get(port)
        if expected_service is None:
            continue  # port hors mesh connu (ex. secret propre au service) — ignoré
        var_service_hint = var_name.removesuffix("_URL").lower().replace("_", "-")
        if var_service_hint != expected_service and var_service_hint in KNOWN_PORTS.values():
            errors.append(f"{path}: {var_name} pointe vers le port {port} ({expected_service}), "
                          f"mais le nom de variable suggère '{var_service_hint}'")
    return errors


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    all_errors = []
    for path in sorted(root.glob("services/*/.env.example")):
        all_errors.extend(check_file(path))
    for path in sorted(root.glob("*/.env.example")):  # gateway, etc.
        all_errors.extend(check_file(path))
    if all_errors:
        print("Incohérences .env.example détectées :")
        for e in all_errors:
            print(f"  - {e}")
        return 1
    print("OK — aucun .env.example incohérent trouvé.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
