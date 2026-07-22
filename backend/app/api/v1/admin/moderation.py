from flask import jsonify, request, g
from app import db
from app.models import User, Agency
from app.api.v1.admin import admin_bp, require_superadmin
from app.services import moderation as mod


def _is_superadmin(user):
    return any(r.slug == 'superadmin' for r in user.roles)


@admin_bp.route('/accounts/users/<int:user_id>/suspend', methods=['POST'])
@require_superadmin
def suspend_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    if u.id == g.current_user.id:
        return jsonify({'error': 'Vous ne pouvez pas vous suspendre vous-même.'}), 409
    if _is_superadmin(u) and mod.count_active_superadmins() <= 1:
        return jsonify({'error': 'Impossible de suspendre le dernier super-admin.'}), 409
    reason = (request.get_json(silent=True) or {}).get('reason')
    mod.suspend_user(u, reason)
    mod.log_admin_action(g.current_user, 'suspend', 'user', u.id, {'reason': reason})
    db.session.commit()
    return jsonify({'message': 'Compte suspendu', 'user': u.to_dict()})


@admin_bp.route('/accounts/users/<int:user_id>/unsuspend', methods=['POST'])
@require_superadmin
def unsuspend_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    mod.unsuspend_user(u)
    mod.log_admin_action(g.current_user, 'unsuspend', 'user', u.id)
    db.session.commit()
    return jsonify({'message': 'Compte réactivé', 'user': u.to_dict()})


@admin_bp.route('/accounts/agencies/<int:agency_id>/suspend', methods=['POST'])
@require_superadmin
def suspend_agency_route(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    reason = (request.get_json(silent=True) or {}).get('reason')
    mod.suspend_agency(a, reason)
    mod.log_admin_action(g.current_user, 'suspend', 'agency', a.id, {'reason': reason})
    db.session.commit()
    return jsonify({'message': 'Agence suspendue', 'agency': a.to_dict()})


@admin_bp.route('/accounts/agencies/<int:agency_id>/unsuspend', methods=['POST'])
@require_superadmin
def unsuspend_agency_route(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    mod.unsuspend_agency(a)
    mod.log_admin_action(g.current_user, 'unsuspend', 'agency', a.id)
    db.session.commit()
    return jsonify({'message': 'Agence réactivée', 'agency': a.to_dict()})


@admin_bp.route('/accounts/users/<int:user_id>', methods=['DELETE'])
@require_superadmin
def delete_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    if u.id == g.current_user.id:
        return jsonify({'error': 'Vous ne pouvez pas supprimer votre propre compte.'}), 409
    if _is_superadmin(u) and mod.count_active_superadmins() <= 1:
        return jsonify({'error': 'Impossible de supprimer le dernier super-admin.'}), 409
    mod.soft_delete_user(u)
    mod.log_admin_action(g.current_user, 'delete', 'user', u.id)
    db.session.commit()
    return jsonify({'message': 'Compte supprimé', 'user': u.to_dict()})


@admin_bp.route('/accounts/users/<int:user_id>/restore', methods=['POST'])
@require_superadmin
def restore_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    if u.anonymized_at is not None:
        return jsonify({'error': 'Compte anonymisé : restauration impossible.'}), 409
    mod.restore_user(u)
    mod.log_admin_action(g.current_user, 'restore', 'user', u.id)
    db.session.commit()
    return jsonify({'message': 'Compte restauré', 'user': u.to_dict()})


@admin_bp.route('/accounts/users/<int:user_id>/anonymize', methods=['POST'])
@require_superadmin
def anonymize_user_route(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    if u.id == g.current_user.id:
        return jsonify({'error': 'Vous ne pouvez pas vous anonymiser vous-même.'}), 409
    if _is_superadmin(u) and mod.count_active_superadmins() <= 1:
        return jsonify({'error': 'Impossible d\'anonymiser le dernier super-admin.'}), 409
    mod.anonymize_user(u)
    mod.log_admin_action(g.current_user, 'anonymize', 'user', u.id)
    db.session.commit()
    return jsonify({'message': 'Compte anonymisé', 'user': u.to_dict()})


@admin_bp.route('/accounts/agencies/<int:agency_id>', methods=['DELETE'])
@require_superadmin
def delete_agency_route(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    mod.soft_delete_agency(a)
    mod.log_admin_action(g.current_user, 'delete', 'agency', a.id)
    db.session.commit()
    return jsonify({'message': 'Agence supprimée', 'agency': a.to_dict()})


@admin_bp.route('/accounts/agencies/<int:agency_id>/restore', methods=['POST'])
@require_superadmin
def restore_agency_route(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    mod.restore_agency(a)
    mod.log_admin_action(g.current_user, 'restore', 'agency', a.id)
    db.session.commit()
    return jsonify({'message': 'Agence restaurée', 'agency': a.to_dict()})
