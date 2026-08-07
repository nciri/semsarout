import secrets
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.api.v1 import api_v1_bp
from app.models import Agency, User, Property
from app.services.moderation import exclude_moderated_properties
from slugify import slugify


def generate_slug(name):
    """Generate URL-friendly slug from name."""
    base_slug = slugify(name)
    slug = base_slug
    counter = 1
    while Agency.query.filter_by(slug=slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug


def generate_api_key():
    """Generate a secure API key."""
    return f"sk_{secrets.token_urlsafe(32)}"


def is_agency_admin(user, agency):
    """Le membre peut-il gérer l'agence (voir/régénérer la clé API, éditer) ?

    Réservé au propriétaire de l'agence (`owner_id`) ou à un admin plateforme.
    Fallback non-régressif : les agences historiques sans `owner_id` restent
    gérables par leurs membres (owner_id est désormais renseigné à la création).
    """
    if user is None or agency is None:
        return False
    if user.account_role == 'admin':
        return True
    if agency.owner_id is not None:
        return agency.owner_id == user.id
    return user.agency_id == agency.id


@api_v1_bp.route('/agencies', methods=['GET'])
def list_agencies():
    """List all verified agencies."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = Agency.query.filter(
        Agency.is_active == True, Agency.is_verified == True,
        Agency.is_suspended.is_(False), Agency.deleted_at.is_(None)
    )

    # Filter by city
    if request.args.get('city'):
        query = query.filter(Agency.city.ilike(f"%{request.args.get('city')}%"))

    # Search by name
    if request.args.get('q'):
        query = query.filter(Agency.name.ilike(f"%{request.args.get('q')}%"))

    query = query.order_by(Agency.name.asc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'agencies': [a.to_dict() for a in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@api_v1_bp.route('/agencies/<slug>', methods=['GET'])
def get_agency(slug):
    """Get agency by slug."""
    agency = Agency.query.filter_by(slug=slug).first_or_404()
    if agency.is_suspended or agency.deleted_at is not None:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({'agency': agency.to_dict(include_members=False)})


@api_v1_bp.route('/agencies/<slug>/properties', methods=['GET'])
def get_agency_properties(slug):
    """Get properties of an agency."""
    agency = Agency.query.filter_by(slug=slug).first_or_404()
    if agency.is_suspended or agency.deleted_at is not None:
        return jsonify({'error': 'Not found'}), 404

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = Property.query.filter(
        Property.agency_id == agency.id,
        Property.status == 'active'
    )
    query = exclude_moderated_properties(query).order_by(Property.published_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'properties': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@api_v1_bp.route('/agencies', methods=['POST'])
@jwt_required()
def create_agency():
    """Create a new agency."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Check if user already has an agency
    if user.agency_id:
        return jsonify({'error': 'You already belong to an agency'}), 400

    data = request.get_json()

    # Validate required fields
    required = ['name', 'email']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    # Create agency
    agency = Agency(
        name=data['name'],
        slug=generate_slug(data['name']),
        description=data.get('description'),
        email=data['email'],
        phone=data.get('phone'),
        website=data.get('website'),
        address=data.get('address'),
        city=data.get('city'),
        postal_code=data.get('postal_code'),
        license_number=data.get('license_number'),
        rc_number=data.get('rc_number'),
        ice_number=data.get('ice_number'),
        api_key=generate_api_key(),
        owner_id=user.id,
    )

    db.session.add(agency)
    db.session.flush()  # Get agency ID

    # Associate user with agency and upgrade to professional
    user.agency_id = agency.id
    user.user_type = 'professional'

    db.session.commit()

    return jsonify({
        'message': 'Agency created successfully',
        'agency': agency.to_dict()
    }), 201


@api_v1_bp.route('/agencies/<slug>', methods=['PUT'])
@jwt_required()
def update_agency(slug):
    """Update agency details."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    agency = Agency.query.filter_by(slug=slug).first_or_404()

    # Réservé au propriétaire / admin de l'agence.
    if not is_agency_admin(user, agency):
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()

    # Update fields
    updatable_fields = [
        'name', 'description', 'email', 'phone', 'website',
        'address', 'city', 'postal_code', 'license_number',
        'rc_number', 'ice_number'
    ]

    for field in updatable_fields:
        if field in data:
            setattr(agency, field, data[field])

    # Update slug if name changed
    if 'name' in data and agency.name != data['name']:
        agency.slug = generate_slug(data['name'])

    db.session.commit()

    return jsonify({
        'message': 'Agency updated successfully',
        'agency': agency.to_dict()
    })


@api_v1_bp.route('/agencies/<slug>/regenerate-api-key', methods=['POST'])
@jwt_required()
def regenerate_api_key(slug):
    """Regenerate agency API key."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    agency = Agency.query.filter_by(slug=slug).first_or_404()

    # Réservé au propriétaire / admin de l'agence.
    if not is_agency_admin(user, agency):
        return jsonify({'error': 'Unauthorized'}), 403

    agency.api_key = generate_api_key()
    db.session.commit()

    return jsonify({
        'message': 'API key regenerated',
        'api_key': agency.api_key
    })


@api_v1_bp.route('/my-agency', methods=['GET'])
@jwt_required()
def my_agency():
    """Get current user's agency."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user.agency_id:
        return jsonify({'error': 'You do not belong to an agency'}), 404

    agency = Agency.query.get(user.agency_id)
    can_manage = is_agency_admin(user, agency)
    data = agency.to_dict(include_members=True, include_api_key=can_manage)
    data['can_manage'] = can_manage  # pilote l'affichage de la section Accès API côté front
    return jsonify({'agency': data})
