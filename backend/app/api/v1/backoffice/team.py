import secrets
import hashlib
from datetime import datetime, timedelta
from flask import jsonify, request, g
from app import db
from app.models import User, Agency, Team, Invitation, Role
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.services import seats
from app.services.mailer import send_email


def _agency():
    return Agency.query.get(g.agency_id) if g.agency_id else None


def _require_manage():
    """Return (agency, None) if allowed, else (None, (json, status))."""
    agency = _agency()
    if not agency:
        return None, (jsonify({'error': 'Aucune agence'}), 400)
    if not seats.can_manage_team(g.current_user, agency):
        return None, (jsonify({'error': "Vous n'avez pas le droit de gérer l'équipe."}), 403)
    return agency, None


@backoffice_bp.route('/team', methods=['GET'])
@require_auth
def get_team():
    agency = _agency()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400
    members = User.query.filter(User.agency_id == agency.id, User.deleted_at.is_(None)).all()
    owner = User.query.get(agency.owner_id) if agency.owner_id else None
    teams = Team.query.filter_by(agency_id=agency.id).all()
    pending = Invitation.query.filter_by(agency_id=agency.id, status='pending').all()

    def member_row(u):
        d = u.to_dict()
        d['roles'] = [r.to_dict() for r in u.roles]
        d['is_owner'] = (u.id == agency.owner_id)
        return d

    return jsonify({
        'owner': owner.to_dict() if owner else None,
        'members': [member_row(u) for u in members],
        'teams': [t.to_dict() for t in teams],
        'invitations': [i.to_dict() for i in pending if i.is_active_pending()],
        'seats': {'used': seats.seats_used(agency), 'limit': seats.seats_limit(agency)},
        'teams_quota': {'used': seats.teams_used(agency), 'limit': seats.teams_limit(agency)},
        'can_manage': seats.can_manage_team(g.current_user, agency),
    })


@backoffice_bp.route('/teams', methods=['POST'])
@require_auth
def create_team():
    agency, err = _require_manage()
    if err:
        return err
    name = (request.get_json(silent=True) or {}).get('name', '').strip()
    if not name:
        return jsonify({'error': "Nom d'équipe requis"}), 400
    if not seats.can_create_team(agency):
        return jsonify({'error': "Limite d'équipes atteinte pour votre plan."}), 409
    if Team.query.filter_by(agency_id=agency.id, name=name).first():
        return jsonify({'error': 'Une équipe porte déjà ce nom.'}), 409
    t = Team(agency_id=agency.id, name=name)
    db.session.add(t)
    db.session.commit()
    return jsonify({'team': t.to_dict()}), 201


@backoffice_bp.route('/teams/<int:team_id>', methods=['PUT'])
@require_auth
def rename_team(team_id):
    agency, err = _require_manage()
    if err:
        return err
    t = Team.query.filter_by(id=team_id, agency_id=agency.id).first()
    if not t:
        return jsonify({'error': 'Équipe introuvable'}), 404
    name = (request.get_json(silent=True) or {}).get('name', '').strip()
    if not name:
        return jsonify({'error': "Nom d'équipe requis"}), 400
    t.name = name
    db.session.commit()
    return jsonify({'team': t.to_dict()})


@backoffice_bp.route('/teams/<int:team_id>', methods=['DELETE'])
@require_auth
def delete_team(team_id):
    agency, err = _require_manage()
    if err:
        return err
    t = Team.query.filter_by(id=team_id, agency_id=agency.id).first()
    if not t:
        return jsonify({'error': 'Équipe introuvable'}), 404
    User.query.filter_by(team_id=t.id).update({'team_id': None})
    db.session.delete(t)
    db.session.commit()
    return jsonify({'message': 'Équipe supprimée'})


@backoffice_bp.route('/team/members/<int:user_id>', methods=['PUT'])
@require_auth
def update_member(user_id):
    agency, err = _require_manage()
    if err:
        return err
    u = User.query.filter_by(id=user_id, agency_id=agency.id).first()
    if not u:
        return jsonify({'error': 'Membre introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'team_id' in data:
        tid = data['team_id']
        if tid is not None and not Team.query.filter_by(id=tid, agency_id=agency.id).first():
            return jsonify({'error': 'Équipe invalide'}), 400
        u.team_id = tid
    if 'role_id' in data and data['role_id'] is not None:
        from sqlalchemy import or_
        role = Role.query.filter(
            Role.id == data['role_id'],
            or_(Role.agency_id == agency.id, Role.agency_id.is_(None))
        ).first()
        if not role:
            return jsonify({'error': 'Rôle invalide'}), 400
        u.roles = [role]
    db.session.commit()
    d = u.to_dict()
    d['roles'] = [r.to_dict() for r in u.roles]
    return jsonify({'member': d})


@backoffice_bp.route('/team/members/<int:user_id>', methods=['DELETE'])
@require_auth
def remove_member(user_id):
    agency, err = _require_manage()
    if err:
        return err
    if user_id == agency.owner_id:
        return jsonify({'error': "Impossible de retirer le propriétaire du compte."}), 409
    u = User.query.filter_by(id=user_id, agency_id=agency.id).first()
    if not u:
        return jsonify({'error': 'Membre introuvable'}), 404
    u.agency_id = None
    u.team_id = None
    db.session.commit()
    return jsonify({'message': 'Membre retiré'})


def _new_token():
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def _invite_path(raw):
    return f'/invitation/{raw}'


@backoffice_bp.route('/team/invitations', methods=['POST'])
@require_auth
def create_invitation():
    agency, err = _require_manage()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'Email requis'}), 400
    if User.query.filter_by(email=email, agency_id=agency.id).first():
        return jsonify({'error': 'Cet utilisateur est déjà membre.'}), 409
    if Invitation.query.filter_by(agency_id=agency.id, email=email, status='pending').first():
        return jsonify({'error': 'Une invitation est déjà en attente pour cet email.'}), 409
    if not seats.can_invite(agency):
        return jsonify({'error': "Limite de sièges atteinte. Passez à un plan supérieur."}), 409

    raw, token_hash = _new_token()
    inv = Invitation(agency_id=agency.id, email=email, role_id=data.get('role_id'),
                     team_id=data.get('team_id'), token_hash=token_hash, status='pending',
                     invited_by=g.current_user.id, expires_at=datetime.utcnow() + timedelta(days=7))
    db.session.add(inv)
    db.session.commit()
    path = _invite_path(raw)
    send_email(email, f"Invitation à rejoindre {agency.name}",
               f"Vous avez été invité à rejoindre {agency.name}. Activez votre compte : {path}")
    return jsonify({'invitation': inv.to_dict(), 'invite_path': path}), 201


@backoffice_bp.route('/team/invitations/<int:inv_id>/resend', methods=['POST'])
@require_auth
def resend_invitation(inv_id):
    agency, err = _require_manage()
    if err:
        return err
    inv = Invitation.query.filter_by(id=inv_id, agency_id=agency.id).first()
    if not inv or inv.status != 'pending':
        return jsonify({'error': 'Invitation introuvable'}), 404
    raw, token_hash = _new_token()
    inv.token_hash = token_hash
    inv.expires_at = datetime.utcnow() + timedelta(days=7)
    db.session.commit()
    path = _invite_path(raw)
    send_email(inv.email, f"Invitation à rejoindre {agency.name}",
               f"Activez votre compte : {path}")
    return jsonify({'invitation': inv.to_dict(), 'invite_path': path})


@backoffice_bp.route('/team/invitations/<int:inv_id>', methods=['DELETE'])
@require_auth
def revoke_invitation(inv_id):
    agency, err = _require_manage()
    if err:
        return err
    inv = Invitation.query.filter_by(id=inv_id, agency_id=agency.id).first()
    if not inv or inv.status != 'pending':
        return jsonify({'error': 'Invitation introuvable'}), 404
    inv.status = 'revoked'
    db.session.commit()
    return jsonify({'message': 'Invitation révoquée'})
