"""Outbox du monolithe — émet des événements `listing.*` vers le bus (v2, Phase 1).

SÉCURITÉ / NON-RÉGRESSION : les listeners ne s'enregistrent QUE si la variable
`SEMSAR_OUTBOX_ENABLED` est vraie. Par défaut (désactivé), le comportement du monolithe
est **strictement inchangé**. Activer uniquement APRÈS avoir créé la table `outbox`
(cf. backend/db/outbox.sql) et lancé le relais (backend/scripts/relay_outbox.py).
"""
import os
from datetime import datetime

from sqlalchemy import event
from sqlalchemy import inspect as sa_inspect

from app import db
from app.models.property import Property

_ENABLED = os.environ.get("SEMSAR_OUTBOX_ENABLED", "").lower() in ("1", "true", "yes")

# Mises à jour ne touchant que ces champs → pas de réindexation (évite le bruit des vues).
_COUNTER_FIELDS = {"views_count", "contacts_count", "favorites_count", "updated_at"}


class OutboxEvent(db.Model):
    __tablename__ = "outbox"

    id = db.Column(db.BigInteger, primary_key=True)
    aggregate_type = db.Column(db.String(80), nullable=False)
    aggregate_id = db.Column(db.String(80), nullable=False)
    event_type = db.Column(db.String(120), nullable=False)  # ex. « listing.updated »
    payload = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    published_at = db.Column(db.DateTime, nullable=True)


def _property_doc(p: Property) -> dict:
    return {
        "id": p.id,
        "reference": p.reference,
        "title": p.title,
        "description": p.description,
        "city": p.city,
        "transaction_type": p.transaction_type,
        "property_type": p.property_type,
        "status": p.status,
        "price": float(p.price) if p.price is not None else None,
        "bedrooms": p.bedrooms,
        "area": p.surface,
        "agency_id": p.agency_id,
        "location": ({"lat": p.latitude, "lon": p.longitude} if p.latitude and p.longitude else None),
    }


def _emit(connection, event_type: str, aggregate_id, payload: dict) -> None:
    # Écrit dans la MÊME transaction/connexion que la mutation métier (outbox atomique).
    connection.execute(
        OutboxEvent.__table__.insert().values(
            aggregate_type="property",
            aggregate_id=str(aggregate_id),
            event_type=event_type,
            payload=payload,
            created_at=datetime.utcnow(),
        )
    )


if _ENABLED:  # pragma: no cover — activation explicite en Phase 1

    @event.listens_for(Property, "after_insert")
    def _on_insert(_mapper, connection, target):
        _emit(connection, "listing.created", target.id, _property_doc(target))

    @event.listens_for(Property, "after_update")
    def _on_update(_mapper, connection, target):
        changed = {a.key for a in sa_inspect(target).attrs if a.history.has_changes()}
        if changed and changed <= _COUNTER_FIELDS:
            return  # seulement des compteurs → pas de réindexation
        _emit(connection, "listing.updated", target.id, _property_doc(target))

    @event.listens_for(Property, "after_delete")
    def _on_delete(_mapper, connection, target):
        _emit(connection, "listing.deleted", target.id, {"id": target.id})
