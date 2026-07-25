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
from app.models.role import ActivityLog
from app.models.user import User

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
    # Doc COMPLET (to_dict + location géo) pour l'indexation search à parité (Stage 2).
    doc = p.to_dict(include_images=True)
    doc["location"] = {"lat": p.latitude, "lon": p.longitude} if p.latitude and p.longitude else None
    return doc


def _iso(v):
    return v.isoformat() if v else None


def _user_doc(user: User) -> dict:
    # Colonnes nécessaires à identity pour l'auth (dont password_hash). Les rôles NE sont PAS
    # touchés ici (accès relationnel pendant le flush = risqué) : synchronisés à la migration ;
    # les changements de rôle (rares) nécessitent un re-seed. La sync critique = suspension/suppression.
    return {
        "id": user.id, "email": user.email, "password_hash": user.password_hash,
        "first_name": user.first_name, "last_name": user.last_name, "phone": user.phone,
        "avatar_url": user.avatar_url, "user_type": user.user_type,
        "account_role": user.account_role, "interest": user.interest,
        "is_active": user.is_active, "is_verified": user.is_verified,
        "created_at": _iso(user.created_at), "last_login": _iso(user.last_login),
        "is_suspended": bool(user.is_suspended), "suspended_at": _iso(user.suspended_at),
        "suspended_reason": user.suspended_reason, "deleted_at": _iso(user.deleted_at),
        "anonymized_at": _iso(user.anonymized_at), "dashboard_config": user.dashboard_config,
        "agency_id": user.agency_id, "team_id": user.team_id,
    }


def _emit(connection, aggregate_type: str, event_type: str, aggregate_id, payload: dict) -> None:
    # Écrit dans la MÊME transaction/connexion que la mutation métier (outbox atomique).
    connection.execute(
        OutboxEvent.__table__.insert().values(
            aggregate_type=aggregate_type,
            aggregate_id=str(aggregate_id),
            event_type=event_type,
            payload=payload,
            created_at=datetime.utcnow(),
        )
    )


if _ENABLED:  # pragma: no cover — activation explicite en Phase 1

    @event.listens_for(Property, "after_insert")
    def _on_insert(_mapper, connection, target):
        _emit(connection, "property", "listing.created", target.id, _property_doc(target))

    @event.listens_for(Property, "after_update")
    def _on_update(_mapper, connection, target):
        changed = {a.key for a in sa_inspect(target).attrs if a.history.has_changes()}
        if changed and changed <= _COUNTER_FIELDS:
            return  # seulement des compteurs → pas de réindexation
        _emit(connection, "property", "listing.updated", target.id, _property_doc(target))

    @event.listens_for(Property, "after_delete")
    def _on_delete(_mapper, connection, target):
        _emit(connection, "property", "listing.deleted", target.id, {"id": target.id})

    @event.listens_for(User, "after_insert")
    def _on_user_insert(_mapper, connection, target):
        _emit(connection, "user", "user.created", target.id, _user_doc(target))

    @event.listens_for(User, "after_update")
    def _on_user_update(_mapper, connection, target):
        _emit(connection, "user", "user.updated", target.id, _user_doc(target))

    @event.listens_for(User, "after_delete")
    def _on_user_delete(_mapper, connection, target):
        _emit(connection, "user", "user.deleted", target.id, {"id": target.id})

    @event.listens_for(ActivityLog, "after_insert")
    def _on_audit_insert(_mapper, connection, target):
        # Journal transverse : chaque écriture d'audit du monolithe est diffusée au service audit.
        _emit(connection, "audit", "audit.logged", target.id, {
            "id": target.id, "user_id": target.user_id, "action": target.action,
            "entity_type": target.entity_type, "entity_id": target.entity_id,
            "extra_data": target.extra_data, "ip_address": target.ip_address,
            "agency_id": target.agency_id, "created_at": _iso(target.created_at),
        })
