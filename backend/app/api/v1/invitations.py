import hashlib
from datetime import datetime
from flask import jsonify, request
from flask_jwt_extended import create_access_token, create_refresh_token
from app import db
from app.api.v1 import api_v1_bp
from app.models import Invitation, Agency, User, Role
from app.services import seats


def _find(token):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return Invitation.query.filter_by(token_hash=token_hash).first()


@api_v1_bp.route('/invitations/<token>', methods=['GET'])
def get_invitation(token):
    inv = _find(token)
    if not inv or inv.status != 'pending':
        return jsonify({'error': 'Invitation invalide'}), 404
    if inv.expires_at and inv.expires_at < datetime.utcnow():
        return jsonify({'error': 'Invitation expirée'}), 410
    agency = Agency.query.get(inv.agency_id)
    role = Role.query.get(inv.role_id) if inv.role_id else None
    return jsonify({'agency_name': agency.name if agency else None,
                    'email': inv.email,
                    'role_name': role.name if role else None})


@api_v1_bp.route('/invitations/<token>/accept', methods=['POST'])
def accept_invitation(token):
    inv = _find(token)
    if not inv or inv.status != 'pending':
        return jsonify({'error': 'Invitation invalide'}), 404
    if inv.expires_at and inv.expires_at < datetime.utcnow():
        return jsonify({'error': 'Invitation expirée'}), 410
    agency = Agency.query.get(inv.agency_id)
    if not agency:
        return jsonify({'error': 'Agence introuvable'}), 404

    data = request.get_json(silent=True) or {}
    password = data.get('password')
    if not password or len(password) < 8:
        return jsonify({'error': 'Mot de passe (8 caractères min.) requis'}), 400

    # Ownership proof: if the invited email already belongs to an account, the
    # submitted password must match it BEFORE anything is mutated. Otherwise a
    # manager who knows an existing user's email could invite it, grab the raw
    # token from the create-invitation response, and take over that account
    # with an arbitrary password.
    existing = User.query.filter_by(email=inv.email).first()
    if existing and not existing.check_password(password):
        return jsonify({'error': "Un compte existe déjà pour cet email. Connectez-vous avec votre mot de passe habituel pour accepter l'invitation."}), 403

    # Re-check seats at accept time (guard the last-seat race), excluding THIS invitation.
    # Mark accepted first so it no longer counts as a pending seat, then require room for
    # the member about to be created: seats_used (without this pending) < limit.
    inv.status = 'accepted'
    db.session.flush()
    _limit = seats.seats_limit(agency)
    if not (_limit == -1 or seats.seats_used(agency) < _limit):
        db.session.rollback()
        return jsonify({'error': "Plus de siège disponible pour cette agence."}), 409

    if existing:
        user = existing
        user.agency_id = agency.id
        user.team_id = inv.team_id
    else:
        user = User(email=inv.email,
                    first_name=(data.get('first_name') or '').strip() or 'Membre',
                    last_name=(data.get('last_name') or '').strip() or '',
                    agency_id=agency.id, team_id=inv.team_id,
                    is_active=True, is_verified=True)
        user.set_password(password)
        db.session.add(user)
    db.session.flush()
    if inv.role_id:
        role = Role.query.get(inv.role_id)
        if role:
            if existing:
                if role not in user.roles:
                    user.roles.append(role)
            else:
                user.roles = [role]
    inv.accepted_at = datetime.utcnow()
    db.session.commit()

    access = create_access_token(identity=str(user.id))
    refresh = create_refresh_token(identity=str(user.id))
    return jsonify({'user': user.to_dict(), 'access_token': access, 'refresh_token': refresh}), 201
