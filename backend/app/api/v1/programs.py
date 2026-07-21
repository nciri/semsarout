"""Programs API endpoints for real estate projects."""
from datetime import datetime
from functools import wraps
import uuid
from flask import request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from slugify import slugify
from app import db
from app.api.v1 import api_v1_bp
from app.models import (
    Program, ProgramUnit, ProgramImage, ProgramUnitImage,
    ProgramPlan, ProgramLot, LOT_STATUSES, User, Subscription, Lead
)


def require_programs_feature(f):
    """Decorator to require programs feature (Pro+ plan)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)

        if not user or not user.agency_id:
            return jsonify({'error': 'Agence requise'}), 403

        subscription = Subscription.query.filter_by(
            agency_id=user.agency_id,
            status='active'
        ).first()

        if not subscription or not subscription.plan.has_programs:
            return jsonify({
                'error': 'Cette fonctionnalité nécessite le plan Pro ou supérieur',
                'upgrade_required': True
            }), 403

        # Check max programs limit
        if subscription.plan.max_programs != -1:
            current_count = Program.query.filter_by(agency_id=user.agency_id).count()
            if current_count >= subscription.plan.max_programs:
                return jsonify({
                    'error': f'Limite de programmes atteinte ({subscription.plan.max_programs})',
                    'limit_reached': True
                }), 403

        g.current_user = user
        g.agency_id = user.agency_id
        return f(*args, **kwargs)
    return decorated


def generate_reference():
    """Generate unique program reference."""
    return f"PRG-{uuid.uuid4().hex[:8].upper()}"


def generate_slug(name, exclude_id=None):
    """Generate a unique slug for a program.

    `exclude_id` skips the program being updated so its own slug doesn't count
    as a collision (otherwise every edit would append -1, breaking its URL)."""
    base_slug = slugify(name, max_length=200)
    slug = base_slug
    counter = 1
    while True:
        query = Program.query.filter_by(slug=slug)
        if exclude_id is not None:
            query = query.filter(Program.id != exclude_id)
        if not query.first():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug


# Numeric unit fields and how to cast them. The frontend sends '' for blank
# number inputs, which must become NULL (not '') before hitting Float/Integer
# columns, otherwise Postgres raises and the request 500s.
NUMERIC_UNIT_FIELDS = {
    'surface_min': float, 'surface_max': float, 'rooms': int, 'bedrooms': int,
    'bathrooms': int, 'price_from': float, 'price_to': float,
    'total_count': int, 'available_count': int
}


def _to_number(value, cast=float):
    """Coerce a value to a number, treating ''/None/invalid as None."""
    if value is None or value == '':
        return None
    try:
        return cast(value)
    except (TypeError, ValueError):
        return None


# ============================================
# PUBLIC ENDPOINTS (No authentication required)
# ============================================

@api_v1_bp.route('/programs', methods=['GET'])
def list_programs():
    """List active programs (public)."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 12, type=int)

    query = Program.query.filter(Program.status == 'active')

    # Filters
    if city := request.args.get('city'):
        query = query.filter(Program.city.ilike(f'%{city}%'))

    if program_type := request.args.get('type'):
        query = query.filter(Program.program_type == program_type)

    if construction_status := request.args.get('construction_status'):
        query = query.filter(Program.construction_status == construction_status)

    if min_price := request.args.get('min_price', type=float):
        query = query.filter(Program.min_price >= min_price)

    if max_price := request.args.get('max_price', type=float):
        query = query.filter(Program.max_price <= max_price)

    # Search
    if q := request.args.get('q'):
        query = query.filter(
            db.or_(
                Program.name.ilike(f'%{q}%'),
                Program.city.ilike(f'%{q}%'),
                Program.neighborhood.ilike(f'%{q}%')
            )
        )

    # Sorting
    sort = request.args.get('sort', 'created_at')
    order = request.args.get('order', 'desc')
    if hasattr(Program, sort):
        sort_col = getattr(Program, sort)
        query = query.order_by(sort_col.desc() if order == 'desc' else sort_col.asc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'programs': [p.to_dict(include_images=True) for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@api_v1_bp.route('/programs/<int:program_id>/contact', methods=['POST'])
def contact_program(program_id):
    """Create a lead/contact request for a real-estate program."""
    program = Program.query.filter_by(id=program_id, status='active').first_or_404()

    data = request.get_json()

    if not data.get('name') or not data.get('phone'):
        return jsonify({'error': 'Nom et téléphone requis'}), 400

    lead = Lead(
        name=data['name'],
        email=data.get('email') or 'non-renseigne@semsarout.ma',
        phone=data.get('phone'),
        message=f"[Programme: {program.name}] {data.get('message', '')}".strip(),
        source='contact_form',
        agency_id=program.agency_id,
        ip_address=request.remote_addr,
        user_agent=request.user_agent.string[:255] if request.user_agent else None
    )

    program.contacts_count = (program.contacts_count or 0) + 1

    db.session.add(lead)
    db.session.commit()

    return jsonify({'message': 'Demande envoyée avec succès'}), 201


@api_v1_bp.route('/programs/<slug>', methods=['GET'])
def get_program(slug):
    """Get program details by slug (public)."""
    program = Program.query.filter_by(slug=slug, status='active').first()

    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    # Increment views
    program.views_count = (program.views_count or 0) + 1
    db.session.commit()

    return jsonify({
        'program': program.to_dict(include_units=True, include_images=True)
    })


# ============================================
# AUTHENTICATED ENDPOINTS (Agency users - Pro+ plan)
# ============================================

@api_v1_bp.route('/programs/my', methods=['GET'])
@jwt_required()
def list_my_programs():
    """List user's agency programs."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = Program.query.filter(Program.agency_id == user.agency_id)

    # Filters
    if status := request.args.get('status'):
        query = query.filter(Program.status == status)

    if q := request.args.get('q'):
        query = query.filter(
            db.or_(
                Program.name.ilike(f'%{q}%'),
                Program.reference.ilike(f'%{q}%'),
                Program.city.ilike(f'%{q}%')
            )
        )

    query = query.order_by(Program.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    # Get subscription info for limit display
    subscription = Subscription.query.filter_by(
        agency_id=user.agency_id,
        status='active'
    ).first()

    programs_limit = None
    has_programs_feature = False
    if subscription and subscription.plan:
        has_programs_feature = subscription.plan.has_programs
        programs_limit = subscription.plan.max_programs if subscription.plan.max_programs != -1 else None

    return jsonify({
        'programs': [p.to_dict(include_units=True, include_images=True) for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'has_programs_feature': has_programs_feature,
        'programs_limit': programs_limit
    })


@api_v1_bp.route('/programs', methods=['POST'])
@jwt_required()
@require_programs_feature
def create_program():
    """Create a new program (Pro+ only)."""
    data = request.get_json()

    if not data.get('name'):
        return jsonify({'error': 'Le nom du programme est requis'}), 400

    program = Program(
        reference=generate_reference(),
        name=data['name'],
        slug=generate_slug(data['name']),
        description=data.get('description'),
        program_type=data.get('program_type', 'residential'),
        address=data.get('address'),
        city=data.get('city'),
        neighborhood=data.get('neighborhood'),
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        total_units=data.get('total_units', 0),
        available_units=data.get('available_units', 0),
        min_price=data.get('min_price'),
        max_price=data.get('max_price'),
        delivery_date=datetime.strptime(data['delivery_date'], '%Y-%m-%d').date() if data.get('delivery_date') else None,
        construction_status=data.get('construction_status', 'planning'),
        amenities=data.get('amenities', []),
        cover_image_url=data.get('cover_image_url'),
        brochure_url=data.get('brochure_url'),
        video_url=data.get('video_url'),
        status='draft',
        agency_id=g.agency_id,
        created_by_id=g.current_user.id
    )

    db.session.add(program)
    db.session.commit()

    return jsonify({
        'program': program.to_dict(),
        'message': 'Programme créé avec succès'
    }), 201


@api_v1_bp.route('/programs/<int:program_id>', methods=['PUT'])
@jwt_required()
def update_program(program_id):
    """Update a program."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    data = request.get_json()
    old_name = program.name

    # Update allowed fields
    updatable_fields = [
        'name', 'description', 'program_type', 'address', 'city', 'neighborhood',
        'latitude', 'longitude', 'total_units', 'available_units', 'min_price',
        'max_price', 'construction_status', 'amenities', 'cover_image_url',
        'brochure_url', 'video_url'
    ]

    for field in updatable_fields:
        if field in data:
            setattr(program, field, data[field])

    # Handle delivery_date separately
    if 'delivery_date' in data:
        if data['delivery_date']:
            program.delivery_date = datetime.strptime(data['delivery_date'], '%Y-%m-%d').date()
        else:
            program.delivery_date = None

    # Regenerate slug only when the name actually changes (keeps stable URLs)
    if 'name' in data and data['name'] != old_name:
        program.slug = generate_slug(data['name'], exclude_id=program.id)

    # Recalculate units and prices from units if requested
    if data.get('recalculate_from_units') and program.units:
        total = sum(u.total_count or 0 for u in program.units)
        available = sum(u.available_count or 0 for u in program.units)
        prices = [u.price_from for u in program.units if u.price_from] + [u.price_to for u in program.units if u.price_to]

        program.total_units = total
        program.available_units = available
        if prices:
            program.min_price = min(prices)
            program.max_price = max(prices)

    program.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'program': program.to_dict(include_units=True, include_images=True),
        'message': 'Programme mis à jour'
    })


@api_v1_bp.route('/programs/<int:program_id>', methods=['DELETE'])
@jwt_required()
def delete_program(program_id):
    """Archive a program."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    # Soft delete - archive the program
    program.status = 'archived'
    program.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'message': 'Programme archivé'})


@api_v1_bp.route('/programs/<int:program_id>/publish', methods=['POST'])
@jwt_required()
def publish_program(program_id):
    """Publish a program."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    # Validate program has required fields
    if not program.name or not program.city:
        return jsonify({'error': 'Veuillez remplir les informations requises (nom, ville)'}), 400

    program.status = 'active'
    program.published_at = datetime.utcnow()
    program.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'program': program.to_dict(),
        'message': 'Programme publié'
    })


@api_v1_bp.route('/programs/<int:program_id>/unpublish', methods=['POST'])
@jwt_required()
def unpublish_program(program_id):
    """Unpublish a program (set to draft)."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    program.status = 'draft'
    program.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'program': program.to_dict(),
        'message': 'Programme mis en brouillon'
    })


# ============================================
# UNIT ENDPOINTS
# ============================================

@api_v1_bp.route('/programs/<int:program_id>/units', methods=['POST'])
@jwt_required()
def add_unit(program_id):
    """Add a unit type to a program."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    data = request.get_json()

    if not data.get('name'):
        return jsonify({'error': 'Le nom du type de bien est requis'}), 400

    unit = ProgramUnit(
        program_id=program_id,
        name=data['name'],
        unit_type=data.get('unit_type'),
        surface_min=_to_number(data.get('surface_min')),
        surface_max=_to_number(data.get('surface_max')),
        rooms=_to_number(data.get('rooms'), int),
        bedrooms=_to_number(data.get('bedrooms'), int),
        bathrooms=_to_number(data.get('bathrooms'), int),
        price_from=_to_number(data.get('price_from')),
        price_to=_to_number(data.get('price_to')),
        total_count=_to_number(data.get('total_count'), int) or 0,
        available_count=_to_number(data.get('available_count'), int) or 0,
        features=data.get('features', []),
        floor_plan_url=data.get('floor_plan_url')
    )

    db.session.add(unit)
    db.session.commit()

    return jsonify({
        'unit': unit.to_dict(),
        'message': 'Type de bien ajouté'
    }), 201


@api_v1_bp.route('/programs/<int:program_id>/units/<int:unit_id>', methods=['PUT'])
@jwt_required()
def update_unit(program_id, unit_id):
    """Update a unit type."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    unit = ProgramUnit.query.filter_by(id=unit_id, program_id=program_id).first()
    if not unit:
        return jsonify({'error': 'Type de bien non trouvé'}), 404

    data = request.get_json()

    updatable_fields = [
        'name', 'unit_type', 'surface_min', 'surface_max', 'rooms', 'bedrooms',
        'bathrooms', 'price_from', 'price_to', 'total_count', 'available_count',
        'features', 'floor_plan_url'
    ]

    for field in updatable_fields:
        if field in data:
            if field in NUMERIC_UNIT_FIELDS:
                setattr(unit, field, _to_number(data[field], NUMERIC_UNIT_FIELDS[field]))
            else:
                setattr(unit, field, data[field])

    db.session.commit()

    return jsonify({
        'unit': unit.to_dict(),
        'message': 'Type de bien mis à jour'
    })


@api_v1_bp.route('/programs/<int:program_id>/units/<int:unit_id>', methods=['DELETE'])
@jwt_required()
def delete_unit(program_id, unit_id):
    """Delete a unit type."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    unit = ProgramUnit.query.filter_by(id=unit_id, program_id=program_id).first()
    if not unit:
        return jsonify({'error': 'Type de bien non trouvé'}), 404

    db.session.delete(unit)
    db.session.commit()

    return jsonify({'message': 'Type de bien supprimé'})


# ============================================
# IMAGE ENDPOINTS
# ============================================

@api_v1_bp.route('/programs/<int:program_id>/images', methods=['POST'])
@jwt_required()
def add_program_image(program_id):
    """Add an image to a program."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    data = request.get_json()

    if not data.get('url'):
        return jsonify({'error': 'URL de l\'image requise'}), 400

    # Get next position
    max_position = db.session.query(db.func.max(ProgramImage.position)).filter_by(program_id=program_id).scalar()
    next_position = (max_position or 0) + 1

    image = ProgramImage(
        program_id=program_id,
        url=data['url'],
        caption=data.get('caption'),
        image_type=data.get('image_type'),
        position=data.get('position', next_position)
    )

    db.session.add(image)
    db.session.commit()

    return jsonify({
        'image': image.to_dict(),
        'message': 'Image ajoutée'
    }), 201


@api_v1_bp.route('/programs/<int:program_id>/images/<int:image_id>', methods=['DELETE'])
@jwt_required()
def delete_program_image(program_id, image_id):
    """Delete a program image."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    image = ProgramImage.query.filter_by(id=image_id, program_id=program_id).first()
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    db.session.delete(image)
    db.session.commit()

    return jsonify({'message': 'Image supprimée'})


@api_v1_bp.route('/programs/<int:program_id>/images/reorder', methods=['POST'])
@jwt_required()
def reorder_program_images(program_id):
    """Reorder program images."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    data = request.get_json()
    image_ids = data.get('image_ids', [])

    for position, image_id in enumerate(image_ids):
        image = ProgramImage.query.filter_by(id=image_id, program_id=program_id).first()
        if image:
            image.position = position

    db.session.commit()

    return jsonify({'message': 'Images réordonnées'})


# ============================================
# UNIT IMAGE ENDPOINTS
# ============================================

@api_v1_bp.route('/programs/<int:program_id>/units/<int:unit_id>/images', methods=['GET'])
def get_unit_images(program_id, unit_id):
    """Get images for a specific unit type (public)."""
    program = Program.query.filter_by(id=program_id, status='active').first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    unit = ProgramUnit.query.filter_by(id=unit_id, program_id=program_id).first()
    if not unit:
        return jsonify({'error': 'Type de bien non trouvé'}), 404

    images = ProgramUnitImage.query.filter_by(unit_id=unit_id).order_by(ProgramUnitImage.position).all()

    return jsonify({
        'unit': unit.to_dict(),
        'images': [img.to_dict() for img in images],
        'total': len(images)
    })


@api_v1_bp.route('/programs/<int:program_id>/units/<int:unit_id>/images', methods=['POST'])
@jwt_required()
def add_unit_image(program_id, unit_id):
    """Add an image to a unit type."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    unit = ProgramUnit.query.filter_by(id=unit_id, program_id=program_id).first()
    if not unit:
        return jsonify({'error': 'Type de bien non trouvé'}), 404

    data = request.get_json()

    if not data.get('url'):
        return jsonify({'error': 'URL de l\'image requise'}), 400

    # Get next position
    max_position = db.session.query(db.func.max(ProgramUnitImage.position)).filter_by(unit_id=unit_id).scalar()
    next_position = (max_position or -1) + 1

    image = ProgramUnitImage(
        unit_id=unit_id,
        url=data['url'],
        caption=data.get('caption'),
        image_type=data.get('image_type'),
        position=data.get('position', next_position)
    )

    db.session.add(image)
    db.session.commit()

    return jsonify({
        'image': image.to_dict(),
        'message': 'Image ajoutée au type de bien'
    }), 201


@api_v1_bp.route('/programs/<int:program_id>/units/<int:unit_id>/images/<int:image_id>', methods=['DELETE'])
@jwt_required()
def delete_unit_image(program_id, unit_id, image_id):
    """Delete an image from a unit type."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    unit = ProgramUnit.query.filter_by(id=unit_id, program_id=program_id).first()
    if not unit:
        return jsonify({'error': 'Type de bien non trouvé'}), 404

    image = ProgramUnitImage.query.filter_by(id=image_id, unit_id=unit_id).first()
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    db.session.delete(image)
    db.session.commit()

    return jsonify({'message': 'Image supprimée'})


@api_v1_bp.route('/programs/<int:program_id>/units/<int:unit_id>/images/reorder', methods=['POST'])
@jwt_required()
def reorder_unit_images(program_id, unit_id):
    """Reorder images for a unit type."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user or not user.agency_id:
        return jsonify({'error': 'Agence requise'}), 403

    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return jsonify({'error': 'Programme non trouvé'}), 404

    unit = ProgramUnit.query.filter_by(id=unit_id, program_id=program_id).first()
    if not unit:
        return jsonify({'error': 'Type de bien non trouvé'}), 404

    data = request.get_json()
    image_ids = data.get('image_ids', [])

    for position, image_id in enumerate(image_ids):
        image = ProgramUnitImage.query.filter_by(id=image_id, unit_id=unit_id).first()
        if image:
            image.position = position

    db.session.commit()

    return jsonify({'message': 'Images du type de bien réordonnées'})


# ============================================
# INTERACTIVE LOT PLAN — plans, lots, interest
# ============================================

LOT_EDITABLE_FIELDS = (
    'reference', 'title', 'lot_type', 'surface', 'rooms', 'bedrooms',
    'bathrooms', 'floor', 'price', 'status', 'zone', 'description', 'image_url'
)


def _owned_program_or_error(program_id):
    """Return (program, None) if the current user's agency owns it, else (None, (resp, code))."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    if not user or not user.agency_id:
        return None, (jsonify({'error': 'Agence requise'}), 403)
    program = Program.query.filter_by(id=program_id, agency_id=user.agency_id).first()
    if not program:
        return None, (jsonify({'error': 'Programme non trouvé'}), 404)
    return program, None


@api_v1_bp.route('/programs/<int:program_id>/plans', methods=['GET'])
def list_program_plans(program_id):
    """List a program's interactive plans with their lots.

    Public for active programs; for non-active (draft/archived) programs only
    the owning agency may view them.
    """
    program = Program.query.get_or_404(program_id)

    if program.status != 'active':
        user = None
        try:
            verify_jwt_in_request(optional=True)
            uid = get_jwt_identity()
            user = User.query.get(int(uid)) if uid else None
        except Exception:
            user = None
        if not user or user.agency_id != program.agency_id:
            return jsonify({'error': 'Programme non trouvé'}), 404

    plans = ProgramPlan.query.filter_by(program_id=program_id).order_by(ProgramPlan.position).all()
    return jsonify({'plans': [p.to_dict(include_lots=True) for p in plans]})


@api_v1_bp.route('/programs/<int:program_id>/plans', methods=['POST'])
@jwt_required()
def create_program_plan(program_id):
    """Add a plan to a program (owner only)."""
    program, err = _owned_program_or_error(program_id)
    if err:
        return err

    data = request.get_json() or {}
    if not data.get('name'):
        return jsonify({'error': 'Le nom du plan est requis'}), 400

    max_pos = db.session.query(db.func.max(ProgramPlan.position)).filter_by(program_id=program_id).scalar()
    plan = ProgramPlan(
        program_id=program_id,
        name=data['name'],
        image_url=data.get('image_url'),
        position=data.get('position', (max_pos or 0) + 1)
    )
    db.session.add(plan)
    db.session.commit()
    return jsonify({'plan': plan.to_dict()}), 201


@api_v1_bp.route('/programs/<int:program_id>/plans/<int:plan_id>', methods=['PUT'])
@jwt_required()
def update_program_plan(program_id, plan_id):
    """Update a plan (owner only)."""
    program, err = _owned_program_or_error(program_id)
    if err:
        return err

    plan = ProgramPlan.query.filter_by(id=plan_id, program_id=program_id).first()
    if not plan:
        return jsonify({'error': 'Plan non trouvé'}), 404

    data = request.get_json() or {}
    for field in ('name', 'image_url', 'position'):
        if field in data:
            setattr(plan, field, data[field])
    db.session.commit()
    return jsonify({'plan': plan.to_dict()})


@api_v1_bp.route('/programs/<int:program_id>/plans/<int:plan_id>', methods=['DELETE'])
@jwt_required()
def delete_program_plan(program_id, plan_id):
    """Delete a plan and its lots (owner only)."""
    program, err = _owned_program_or_error(program_id)
    if err:
        return err

    plan = ProgramPlan.query.filter_by(id=plan_id, program_id=program_id).first()
    if not plan:
        return jsonify({'error': 'Plan non trouvé'}), 404

    db.session.delete(plan)
    db.session.commit()
    return jsonify({'message': 'Plan supprimé'})


@api_v1_bp.route('/programs/<int:program_id>/lots', methods=['POST'])
@jwt_required()
def create_program_lot(program_id):
    """Add a lot to a plan (owner only)."""
    program, err = _owned_program_or_error(program_id)
    if err:
        return err

    data = request.get_json() or {}
    plan = ProgramPlan.query.filter_by(id=data.get('plan_id'), program_id=program_id).first()
    if not plan:
        return jsonify({'error': 'Plan non trouvé'}), 404

    status = data.get('status', 'available')
    if status not in LOT_STATUSES:
        status = 'available'

    lot = ProgramLot(
        program_id=program_id,
        plan_id=plan.id,
        reference=data.get('reference'),
        title=data.get('title'),
        lot_type=data.get('lot_type'),
        surface=data.get('surface'),
        rooms=data.get('rooms'),
        bedrooms=data.get('bedrooms'),
        bathrooms=data.get('bathrooms'),
        floor=data.get('floor'),
        price=data.get('price'),
        status=status,
        zone=data.get('zone', []),
        description=data.get('description'),
        image_url=data.get('image_url')
    )
    db.session.add(lot)
    db.session.commit()
    return jsonify({'lot': lot.to_dict()}), 201


@api_v1_bp.route('/programs/<int:program_id>/lots/<int:lot_id>', methods=['PUT'])
@jwt_required()
def update_program_lot(program_id, lot_id):
    """Update a lot (owner only)."""
    program, err = _owned_program_or_error(program_id)
    if err:
        return err

    lot = ProgramLot.query.filter_by(id=lot_id, program_id=program_id).first()
    if not lot:
        return jsonify({'error': 'Lot non trouvé'}), 404

    data = request.get_json() or {}
    for field in LOT_EDITABLE_FIELDS:
        if field in data:
            if field == 'status' and data[field] not in LOT_STATUSES:
                continue
            setattr(lot, field, data[field])
    db.session.commit()
    return jsonify({'lot': lot.to_dict()})


@api_v1_bp.route('/programs/<int:program_id>/lots/<int:lot_id>/status', methods=['PATCH'])
@jwt_required()
def update_program_lot_status(program_id, lot_id):
    """Change a lot's status (owner only)."""
    program, err = _owned_program_or_error(program_id)
    if err:
        return err

    lot = ProgramLot.query.filter_by(id=lot_id, program_id=program_id).first()
    if not lot:
        return jsonify({'error': 'Lot non trouvé'}), 404

    status = (request.get_json() or {}).get('status')
    if status not in LOT_STATUSES:
        return jsonify({'error': 'Statut invalide'}), 400
    lot.status = status
    db.session.commit()
    return jsonify({'lot': lot.to_dict()})


@api_v1_bp.route('/programs/<int:program_id>/lots/<int:lot_id>', methods=['DELETE'])
@jwt_required()
def delete_program_lot(program_id, lot_id):
    """Delete a lot (owner only)."""
    program, err = _owned_program_or_error(program_id)
    if err:
        return err

    lot = ProgramLot.query.filter_by(id=lot_id, program_id=program_id).first()
    if not lot:
        return jsonify({'error': 'Lot non trouvé'}), 404

    db.session.delete(lot)
    db.session.commit()
    return jsonify({'message': 'Lot supprimé'})


@api_v1_bp.route('/programs/<int:program_id>/lots/interest', methods=['POST'])
def express_lot_interest(program_id):
    """Buyer expresses interest in one or more lots — creates a Lead for the
    promoter. Lot statuses are never changed by this endpoint."""
    program = Program.query.filter_by(id=program_id, status='active').first_or_404()

    data = request.get_json() or {}
    lot_ids = data.get('lot_ids', [])

    if not data.get('name') or not data.get('phone'):
        return jsonify({'error': 'Nom et téléphone requis'}), 400
    if not lot_ids:
        return jsonify({'error': 'Aucun lot sélectionné'}), 400

    lots = ProgramLot.query.filter(
        ProgramLot.program_id == program_id, ProgramLot.id.in_(lot_ids)
    ).all()
    lot_refs = ', '.join(l.reference or f'#{l.id}' for l in lots) or '—'
    user_msg = (data.get('message') or '').strip()
    message = f"[Programme: {program.name} — Lots: {lot_refs}] {user_msg}".strip()

    lead = Lead(
        name=data['name'],
        email=data.get('email') or 'non-renseigne@semsarout.ma',
        phone=data.get('phone'),
        message=message,
        source='contact_form',
        agency_id=program.agency_id,
        ip_address=request.remote_addr,
        user_agent=request.user_agent.string[:255] if request.user_agent else None
    )
    program.contacts_count = (program.contacts_count or 0) + 1
    db.session.add(lead)
    db.session.commit()

    return jsonify({'message': 'Demande envoyée avec succès', 'lots': lot_refs}), 201
