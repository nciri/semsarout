#!/usr/bin/env python3
"""Garde-fou : MIGRATIONS (infra/prod/deploy-remote.sh) porte une entrée par migration
additive présente sur disque.

Pourquoi ce fichier plutôt qu'une relecture humaine : `create_all` crée les tables
manquantes mais n'émet JAMAIS d'ALTER. Une migration additive absente de MIGRATIONS
n'est donc jamais jouée en production, et toute colonne mappée par l'ORM qu'elle devait
ajouter fait lever `UndefinedColumn` à chaque SELECT du modèle — panne totale du service,
pas un détail. Le défaut s'est produit deux fois (identity/add_features_synced_at.sql,
puis transactions/migrate_notes_text.sql) parce que le décompte était vérifié à la main :
six scripts constatés quand six existaient, un septième arrivé ensuite.

Exclusions motivées, pas une liste d'exceptions à rallonge :
 - `schema.sql` n'est jamais rejoué tel quel (son CREATE ROLE nu n'est pas idempotent) ;
 - `migrate_from_monolith.sql` vise la bascule depuis le monolithe legacy, hors périmètre
   du mesh (jouée une fois, hors du script de déploiement).

Appelé par .githooks/pre-push, par la CI (job « Cohérence du dépôt ») et par
infra/prod/tests/deploy-remote.test.sh, qui s'appuie sur lui au lieu de redire la règle.
"""
import re
import sys
from pathlib import Path

EXCLUDED = {"schema.sql", "migrate_from_monolith.sql"}
BLOCK_RE = re.compile(r'^MIGRATIONS="$(.*?)^"$', re.MULTILINE | re.DOTALL)


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    script = root / "infra" / "prod" / "deploy-remote.sh"
    block = BLOCK_RE.search(script.read_text())
    if block is None:
        print(f"{script}: bloc MIGRATIONS=\"…\" introuvable (le script a-t-il changé de forme ?)")
        return 1
    declared = {line.strip() for line in block.group(1).splitlines() if line.strip()}
    on_disk = {
        f"{p.parent.parent.name}/{p.name}"
        for p in root.glob("services/*/db/*.sql")
        if p.name not in EXCLUDED
    }

    missing = sorted(on_disk - declared)
    ghosts = sorted(declared - on_disk)
    for entry in missing:
        print(f"  - {entry} est sur disque mais absente de MIGRATIONS (jamais jouée en prod)")
    for entry in ghosts:
        print(f"  - {entry} figure dans MIGRATIONS mais n'existe pas sur disque")
    if missing or ghosts:
        print("MIGRATIONS et services/*/db/ ont divergé — corrige infra/prod/deploy-remote.sh.")
        return 1
    print(f"OK — les {len(on_disk)} migrations additives sur disque figurent toutes dans MIGRATIONS.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
