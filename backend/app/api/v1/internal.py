"""Endpoints internes (transition strangler v2) — protégés par un jeton interne.

Additif et sans effet sur le comportement public. Permet aux services extraits de
récupérer des données transverses tant que leur domaine n'est pas extrait
(ex. listing a besoin des comptes modérés pour masquer les annonces — spec §6).
"""
import os

from flask import jsonify, request

from app.api.v1 import api_v1_bp
from app.models import Agency, Property, User

_TOKEN = os.environ.get("SEMSAR_INTERNAL_TOKEN", "change-me-internal")


@api_v1_bp.route("/internal/moderation/hidden", methods=["GET"])
def internal_moderation_hidden():
    """Comptes masqués (suspendus / supprimés) — owners + agences."""
    if request.headers.get("X-Internal-Token") != _TOKEN:
        return jsonify({"error": "Forbidden"}), 403
    user_ids = [
        u.id for u in User.query.filter(
            (User.is_suspended.is_(True)) | (User.deleted_at.isnot(None))
        ).all()
    ]
    agency_ids = [
        a.id for a in Agency.query.filter(
            (Agency.is_suspended.is_(True)) | (Agency.deleted_at.isnot(None))
        ).all()
    ]
    return jsonify({"user_ids": user_ids, "agency_ids": agency_ids})


@api_v1_bp.route("/internal/agency/users", methods=["GET"])
def internal_agency_users():
    """Utilisateurs (agents) d'une agence — pour les noms/assignation côté crm."""
    if request.headers.get("X-Internal-Token") != _TOKEN:
        return jsonify({"error": "Forbidden"}), 403
    agency_id = request.args.get("agency_id", type=int)
    query = User.query.filter(User.is_active.is_(True))
    if agency_id:
        query = query.filter(User.agency_id == agency_id)
    return jsonify({
        "users": [{"id": u.id, "name": u.full_name, "email": u.email} for u in query.all()]
    })


@api_v1_bp.route("/internal/properties/<int:property_id>/contact-phone", methods=["GET"])
def internal_contact_phone(property_id):
    """Téléphone de contact d'un bien (agence ou propriétaire) — pour reveal-phone côté listing.
    Transition : le téléphone appartient au domaine identity/agency, pas encore extrait."""
    if request.headers.get("X-Internal-Token") != _TOKEN:
        return jsonify({"error": "Forbidden"}), 403
    p = Property.query.get(property_id)
    if p is None:
        return jsonify({"error": "Not found"}), 404
    if p.agency_id:
        agency = Agency.query.get(p.agency_id)
        phone = agency.phone if agency else None
    else:
        owner = User.query.get(p.owner_id)
        phone = owner.phone if owner else None
    return jsonify({"phone": phone})
