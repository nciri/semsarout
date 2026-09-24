"""Émission d'`audit.logged` depuis identity vers le service audit (`/admin/activity`).

Les écritures RBAC (attribution de rôles, CRUD des rôles) étaient tracées par le monolithe ;
maintenant qu'elles sont servies par identity, leurs traces doivent être ré-émises. On réutilise
l'outbox transactionnel : l'événement part DANS la même transaction que la mutation.

**ID disjoint** : le service audit indexe l'idempotence sur `activity_log.id` et insère avec cet
id explicite. Un id d'identity qui collisionnerait avec un `activity_logs.id` du monolithe ferait
silencieusement ignorer l'un des deux. On tire donc les ids d'une séquence dédiée démarrée très
haut (`_ID_BASE`), plage que le monolithe n'atteindra jamais.

Plages allouées (une par service émetteur, disjointes entre elles) :
  - identity      : 9_000_000_000_001+
  - coloc-listing : 9_100_000_000_001+  (services/coloc-listing/app/audit.py)
  - trust-safety  : 9_200_000_000_001+  (services/trust-safety/app/audit.py)
"""
from datetime import datetime
from itertools import count

from sqlalchemy import text
from sqlalchemy.orm import Session

from semsar_events import enqueue

_SEQ = "identity.audit_log_seq"
_ID_BASE = 9_000_000_000_001  # début de la séquence — cf. db.init_db()
_fallback_ids = count(_ID_BASE)


def _next_id(db: Session) -> int:
    """Id d'audit : `nextval` sous PostgreSQL, compteur en mémoire ailleurs (sqlite des
    tests, qui n'a pas de séquence)."""
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        return db.execute(text(f"SELECT nextval('{_SEQ}')")).scalar()
    return next(_fallback_ids)


def emit(
    db: Session,
    *,
    actor_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int | None,
    agency_id: int | None = None,
    extra_data: dict | None = None,
    tenant: str = "semsar",
) -> None:
    """Enqueue un `audit.logged` dans la transaction courante (commit à la charge de l'appelant).

    `tenant` par défaut `semsar` : les émissions historiques (RBAC, impersonation) restent
    dans le journal semsarout sans avoir à être touchées."""
    audit_id = _next_id(db)
    enqueue(db, "audit", audit_id, "audit.logged", {
        "id": audit_id,
        "tenant": tenant,
        "user_id": actor_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "extra_data": extra_data,
        "ip_address": None,
        "agency_id": agency_id,
        "created_at": datetime.utcnow().isoformat(),
    })
