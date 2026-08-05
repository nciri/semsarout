"""Import semi-automatisé des prix de référence par quartier (`geo.neighborhood_price_ref`).

Lit un CSV (régénéré chaque trimestre depuis Mubawab / IPAI / etc.) et fait un **upsert
idempotent** sur la clé (city, neighborhood, transaction_type, property_type). Rejouable
sans doublon : une ligne déjà présente est mise à jour, une nouvelle est insérée.

Usage (depuis services/geo, avec le rôle DB geo) :
    DATABASE_URL=postgresql+psycopg://geo:geo@localhost:5432/semsar_dev \
        python -m app.importer [chemin.csv] [--url https://.../prix.csv]

Colonnes CSV (en-tête requis) :
    city, neighborhood, transaction_type, avg_price_sqm            (obligatoires)
    property_type, min_price_sqm, max_price_sqm, source            (optionnelles)

`transaction_type` ∈ {sale, rent}. Les libellés `city`/`neighborhood` doivent matcher
exactement ceux des biens pour que le rapprochement portefeuille↔marché fonctionne.
"""
import csv
import io
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

from .db import SessionLocal, init_db
from .models import NeighborhoodPriceRef

DEFAULT_CSV = Path(__file__).resolve().parent.parent / "data" / "neighborhood_prices.csv"
REQUIRED = ("city", "neighborhood", "transaction_type", "avg_price_sqm")


def _num(v):
    v = (v or "").strip().replace(" ", "").replace(",", ".")
    return float(v) if v else None


def _key(city, neighborhood, ttype, ptype):
    return (city.strip().lower(), neighborhood.strip().lower(), ttype.strip().lower(), (ptype or "").strip().lower())


def _read_rows(path: str | None, url: str | None) -> list[dict]:
    if url:
        with urllib.request.urlopen(url) as resp:  # noqa: S310 — source de données interne/maîtrisée
            text = resp.read().decode("utf-8-sig")
    else:
        text = Path(path or DEFAULT_CSV).read_text(encoding="utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def run(path: str | None = None, url: str | None = None) -> dict:
    init_db()
    rows = _read_rows(path, url)
    db = SessionLocal()
    inserted = updated = skipped = 0
    try:
        # Index des lignes existantes pour un upsert sans requête par ligne.
        existing = {
            _key(r.city, r.neighborhood, r.transaction_type, r.property_type): r
            for r in db.query(NeighborhoodPriceRef).all()
        }
        for i, row in enumerate(rows, start=2):  # ligne 1 = en-tête
            city = (row.get("city") or "").strip()
            neighborhood = (row.get("neighborhood") or "").strip()
            ttype = (row.get("transaction_type") or "").strip().lower()
            avg = _num(row.get("avg_price_sqm"))
            if not city or not neighborhood or ttype not in ("sale", "rent") or not avg or avg <= 0:
                print(f"  ! ligne {i} ignorée (données invalides) : {row}")
                skipped += 1
                continue
            ptype = (row.get("property_type") or "").strip() or None
            source = (row.get("source") or "").strip() or "import"
            vmin, vmax = _num(row.get("min_price_sqm")), _num(row.get("max_price_sqm"))
            k = _key(city, neighborhood, ttype, ptype)
            ref = existing.get(k)
            if ref is None:
                ref = NeighborhoodPriceRef(city=city, neighborhood=neighborhood,
                                           transaction_type=ttype, property_type=ptype)
                db.add(ref)
                existing[k] = ref
                inserted += 1
            else:
                updated += 1
            ref.avg_price_sqm = avg
            ref.min_price_sqm = vmin
            ref.max_price_sqm = vmax
            ref.source = source
            ref.updated_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()
    summary = {"inserted": inserted, "updated": updated, "skipped": skipped, "total": len(rows)}
    print(f"Import terminé : {inserted} insérées, {updated} mises à jour, {skipped} ignorées "
          f"(sur {len(rows)} lignes).")
    return summary


def main(argv: list[str]) -> None:
    path, url = None, None
    args = list(argv)
    if "--url" in args:
        idx = args.index("--url")
        url = args[idx + 1]
        del args[idx:idx + 2]
    if args:
        path = args[0]
    run(path, url)


if __name__ == "__main__":
    main(sys.argv[1:])
