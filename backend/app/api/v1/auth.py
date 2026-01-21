from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity
)
from app import db
from app.api.v1 import api_v1_bp
from app.models import User


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

    # Create user
    user = User(
        email=data['email'],
        first_name=data['first_name'],
        last_name=data['last_name'],
        phone=data.get('phone'),
        user_type=data.get('user_type', 'particular')
    )
    user.set_password(data['password'])

    db.session.add(user)
    db.session.commit()

    # Generate tokens (identity must be a string for flask-jwt-extended)
    access_token = create_access_token(identity=str(user.id))
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

    # Update last login
    user.last_login = datetime.utcnow()
    db.session.commit()

    # Generate tokens (identity must be a string for flask-jwt-extended)
    access_token = create_access_token(identity=str(user.id))
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
    access_token = create_access_token(identity=str(current_user_id))
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

    db.session.commit()

    return jsonify({'user': user.to_dict()})


@api_v1_bp.route('/auth/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """Change user password."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    data = request.get_json()

    if not data.get('current_password') or not data.get('new_password'):
        return jsonify({'error': 'Current and new password are required'}), 400

    if not user.check_password(data['current_password']):
        return jsonify({'error': 'Current password is incorrect'}), 401

    user.set_password(data['new_password'])
    db.session.commit()

    return jsonify({'message': 'Password changed successfully'})
