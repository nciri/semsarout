from datetime import datetime, timedelta
from flask import request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity
)
from app import db
from app.api.v1 import api_v1_bp
from app.models import User, Subscription


def _identity_claims(user):
    """Claims d'identité embarqués dans le JWT pour que le BFF résolve l'identité
    LOCALEMENT (sévrage de la frontière d'auth — plus d'appel /auth/me + /my-subscription)."""
    roles = list(user.roles) if hasattr(user, 'roles') else []
    is_superadmin = any(getattr(r, 'slug', None) == 'superadmin' for r in roles)
    features = []
    if user.agency_id:
        sub = Subscription.query.filter_by(agency_id=user.agency_id).first()
        plan = sub.plan if sub else None
        if plan:
            if plan.has_artisans:
                features.append('artisans')
            if plan.has_contracts:
                features.append('contracts')
            if plan.has_legal:
                features.append('legal')
    return {
        'agency_id': user.agency_id,
        'is_superadmin': is_superadmin,
        'account_role': user.account_role,
        'features': features,
    }


@api_v1_bp.route('/auth/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()

    # Validate required fields
    required = ['email', 'password', 'first_name', 'last_name']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    # Check if user already exists
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already registered'}), 409

    # Declared interest is optional and must match the known service keys
    valid_interests = {
        'vente', 'mise-en-location', 'gestion-locative',
        'courte-duree', 'estimation', 'autre'
    }
    interest = data.get('interest')
    if interest not in valid_interests:
        interest = None

    # Create user
    user = User(
        email=data['email'],
        first_name=data['first_name'],
        last_name=data['last_name'],
        phone=data.get('phone'),
        user_type=data.get('user_type', 'particular'),
        interest=interest
    )
    user.set_password(data['password'])

    db.session.add(user)
    db.session.commit()

    # Generate tokens (identity must be a string for flask-jwt-extended)
    access_token = create_access_token(identity=str(user.id), additional_claims=_identity_claims(user))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        'message': 'User registered successfully',
        'user': user.to_dict(),
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 201


@api_v1_bp.route('/auth/login', methods=['POST'])
def login():
    """Authenticate user and return tokens."""
    data = request.get_json()

    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=data['email']).first()

    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid email or password'}), 401

    if not user.is_active:
        return jsonify({'error': 'Account is deactivated'}), 403

    from app.services.moderation import is_login_blocked
    blocked, reason = is_login_blocked(user)
    if blocked:
        return jsonify({'error': reason}), 403

    # Update last login
    user.last_login = datetime.utcnow()
    db.session.commit()

    # Generate tokens (identity must be a string for flask-jwt-extended)
    access_token = create_access_token(identity=str(user.id), additional_claims=_identity_claims(user))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        'user': user.to_dict(),
        'access_token': access_token,
        'refresh_token': refresh_token
    })


@api_v1_bp.route('/auth/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id) if current_user_id else None
    if not user:
        return jsonify({'error': 'User not found'}), 404

    from app.services.moderation import is_login_blocked
    blocked, reason = is_login_blocked(user)
    if blocked:
        return jsonify({'error': reason}), 403

    access_token = create_access_token(identity=str(current_user_id), additional_claims=_identity_claims(user))
    return jsonify({'access_token': access_token})


@api_v1_bp.route('/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current authenticated user."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({'user': user.to_dict()})


@api_v1_bp.route('/auth/me', methods=['PUT'])
@jwt_required()
def update_current_user():
    """Update current user profile."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()

    # Update allowed fields
    if 'first_name' in data:
        user.first_name = data['first_name']
    if 'last_name' in data:
        user.last_name = data['last_name']
    if 'phone' in data:
        user.phone = data['phone']
    if 'avatar_url' in data:
        user.avatar_url = data['avatar_url']

    db.session.commit()

    return jsonify({'user': user.to_dict()})


@api_v1_bp.route('/auth/me', methods=['DELETE'])
@jwt_required()
def delete_current_user():
    """Delete (deactivate) the current user's account."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json(silent=True) or {}
    if not data.get('password') or not user.check_password(data['password']):
        return jsonify({'error': 'Mot de passe requis pour confirmer la suppression'}), 401

    # Soft delete: deactivate rather than hard-delete to preserve referential integrity
    user.is_active = False
    user.email = f'deleted-{user.id}-{user.email}'
    db.session.commit()

    return jsonify({'message': 'Compte supprimé'})


@api_v1_bp.route('/auth/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """Change user password."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()

    if not data.get('current_password') or not data.get('new_password'):
        return jsonify({'error': 'Current and new password are required'}), 400

    if not user.check_password(data['current_password']):
        return jsonify({'error': 'Current password is incorrect'}), 401

    user.set_password(data['new_password'])
    db.session.commit()

    return jsonify({'message': 'Password changed successfully'})


@api_v1_bp.route('/auth/forgot-password', methods=['POST'])
def forgot_password():
    """Request a password reset token."""
    import secrets
    import hashlib

    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()

    generic_response = {'message': 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.'}

    if not email:
        return jsonify({'error': 'Email requis'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        # Do not reveal whether the account exists
        return jsonify(generic_response)

    token = secrets.token_urlsafe(32)
    # Store only a hash: a DB or log leak alone should never yield a usable credential.
    user.reset_token = hashlib.sha256(token.encode()).hexdigest()
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.session.commit()

    # No email provider configured yet. Only surface the raw link when explicitly
    # enabled for local/dev use — never log secrets in a normal environment.
    if current_app.config.get('DEBUG_EMAIL_TO_LOG'):
        reset_link = f'/reinitialiser-mot-de-passe?token={token}'
        current_app.logger.info(f'[DEV ONLY] Password reset link for {email}: {reset_link}')
    else:
        current_app.logger.info('Password reset requested for %s', email)

    return jsonify(generic_response)


@api_v1_bp.route('/auth/reset-password', methods=['POST'])
def reset_password():
    """Reset password using a valid reset token."""
    import hashlib

    data = request.get_json() or {}
    token = data.get('token')
    new_password = data.get('new_password')

    if not token or not new_password:
        return jsonify({'error': 'Token et nouveau mot de passe requis'}), 400

    if len(new_password) < 8:
        return jsonify({'error': 'Le mot de passe doit contenir au moins 8 caractères'}), 400

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    user = User.query.filter_by(reset_token=token_hash).first()

    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        return jsonify({'error': 'Lien de réinitialisation invalide ou expiré'}), 400

    user.set_password(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.session.commit()

    return jsonify({'message': 'Mot de passe réinitialisé avec succès'})
