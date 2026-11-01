"""Rattrapage de la projection de recherche — réémet `listing.created` pour tous les biens.

    python -m app.backfill

La projection OpenSearch n'est alimentée que par les événements `listing.*`. Un bien entré en
base autrement (copie depuis l'ancien monolithe, amorçage, restauration) n'a donc jamais été
indexé : le back-office, qui lit la base, le montre, et le site public, qui lit l'index, ne le
montre pas. C'est le « reconstructible en rejouant les événements » promis par le worker search,
qui n'avait pas d'outil pour le faire.

Sans effet de bord sur l'index : l'indexation est un upsert par id, donc relançable.
"""
from sqlalchemy.orm import Session

from semsar_common import get_settings, setup_logging
from semsar_events import enqueue

from . import events
from .db import SessionLocal
from .models import Property


def reindex_all(db: Session) -> int:
    """Pose un `listing.created` dans l'outbox par bien existant. Rend le nombre de biens."""
    from .main import _event_doc  # tardif : `main` monte l'app FastAPI au chargement

    biens = db.query(Property).order_by(Property.id).all()
    for p in biens:
        enqueue(db, "property", p.id, events.LISTING_CREATED, _event_doc(db, p))
    db.commit()
    return len(biens)


def main() -> None:
    settings = get_settings()
    setup_logging(settings.service_name, settings.log_level)
    db = SessionLocal()
    try:
        print(f"{reindex_all(db)} biens remis dans l'outbox — le relais les publiera.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
