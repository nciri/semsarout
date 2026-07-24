"""Endpoints internes (transition strangler v2) — protégés par un jeton interne.

Additif et sans effet sur le comportement public. Permet aux services extraits de
récupérer des données transverses tant que leur domaine n'est pas extrait
(ex. listing a besoin des comptes modérés pour masquer les annonces — spec §6).
"""
import os

from flask import jsonify, request

from app.api.v1 import api_v1_bp
from app.models import Agency, User

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
