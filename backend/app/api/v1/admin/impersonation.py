from datetime import timedelta
from flask import jsonify, g
from flask_jwt_extended import create_access_token
from app import db
from app.models import User
from app.api.v1.admin import admin_bp, require_superadmin
from app.services import moderation as mod


@admin_bp.route('/accounts/users/<int:user_id>/impersonate', methods=['POST'])
@require_superadmin
def impersonate(user_id):
    target = User.query.get(user_id)
    if not target:
        return jsonify({'error': 'User not found'}), 404
    if target.deleted_at is not None:
        return jsonify({'error': 'Compte supprimé : impersonation impossible.'}), 403
    if any(r.slug == 'superadmin' for r in target.roles):
        return jsonify({'error': 'Impossible de se faire passer pour un super-admin.'}), 409
    token = create_access_token(
        identity=str(target.id),
        additional_claims={'impersonated_by': g.current_user.id},
        expires_delta=timedelta(minutes=30))
    mod.log_admin_action(g.current_user, 'impersonate_start', 'user', target.id)
    db.session.commit()
    return jsonify({'access_token': token, 'user': target.to_dict()})
