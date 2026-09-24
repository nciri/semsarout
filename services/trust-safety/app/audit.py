"""Émission d'`audit.logged` depuis trust-safety vers le service audit (journal back-office).

Calqué sur `services/identity/app/audit.py` : outbox transactionnel (l'événement part DANS la
même transaction que la mutation), jamais d'appel HTTP.

**ID disjoint** : le service audit insère avec l'id porté par l'événement et en fait sa clé
d'idempotence. Deux émetteurs qui tireraient le même id feraient silencieusement disparaître
l'une des deux lignes. Chaque émetteur a donc sa propre plage ; celle de trust-safety démarre
à `_ID_BASE` (identity : 9_000_000_000_001+, coloc-listing : 9_100_000_000_001+).

`entity_id` porte l'identifiant du signalement, qui est déjà un entier.
"""
from datetime import datetime
from itertools import count

from sqlalchemy import text
from sqlalchemy.orm import Session

from semsar_events import enqueue

TENANT = "m3a-l3achrane"  # seules les actions de modération m3a sont journalisées ici

_SEQ = "trust_safety.audit_log_seq"
_ID_BASE = 9_200_000_000_001  # début de la séquence — cf. db.init_db()
_fallback_ids = count(_ID_BASE)


def _next_id(db: Session) -> int:
    """Id d'audit : `nextval` sous PostgreSQL, compteur en mémoire ailleurs (sqlite des
    tests, qui n'a pas de séquence)."""
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        return db.execute(text(f"SELECT nextval('{_SEQ}')")).scalar()
    return next(_fallback_ids)


def emit(db: Session, *, actor_id: int | None, action: str, entity_type: str,
         entity_id: int | None = None, extra_data: dict | None = None) -> None:
    """Enqueue un `audit.logged` dans la transaction courante (commit à la charge de l'appelant)."""
    audit_id = _next_id(db)
    enqueue(db, "audit", audit_id, "audit.logged", {
        "id": audit_id,
        "tenant": TENANT,
        "user_id": actor_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "extra_data": extra_data,
        "ip_address": None,
        "agency_id": None,
        "created_at": datetime.utcnow().isoformat(),
    })
