from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.api.v1 import api_v1_bp
from app.models import User


@api_v1_bp.route('/users/me', methods=['GET'])
@jwt_required()
def get_my_profile():
    """Get current user's profile."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    return jsonify({
        'user': {
            'id': user.id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'phone': user.phone,
            'avatar_url': user.avatar_url,
            'user_type': user.user_type,
            'agency_id': user.agency_id,
            'created_at': user.created_at.isoformat() if user.created_at else None
        }
    })


@api_v1_bp.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """Get public user profile."""
    user = User.query.get_or_404(user_id)

    # Return limited public info
    return jsonify({
        'user': {
            'id': user.id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'avatar_url': user.avatar_url,
            'user_type': user.user_type,
            'agency_id': user.agency_id,
            'created_at': user.created_at.isoformat() if user.created_at else None
        }
    })


@api_v1_bp.route('/users/<int:user_id>/properties', methods=['GET'])
def get_user_properties(user_id):
    """Get user's active properties."""
    user = User.query.get_or_404(user_id)

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    from app.models import Property
    query = Property.query.filter(
        Property.owner_id == user_id,
        Property.status == 'active'
    ).order_by(Property.published_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'properties': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })
