from flask import jsonify, request, g
from datetime import datetime
from sqlalchemy import or_
from app import db
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Property, ActivityLog, User


@backoffice_bp.route('/properties', methods=['GET'])
@require_auth
def get_properties():
    """Get all properties with filtering and pagination."""
    agency_id = g.agency_id
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    # Filters
    property_type = request.args.get('type')
    transaction_type = request.args.get('transaction_type')
    status = request.args.get('status')
    city = request.args.get('city')
    min_price = request.args.get('min_price', type=float)
    max_price = request.args.get('max_price', type=float)
    search = request.args.get('q')

    query = Property.query
    if agency_id:
        query = query.filter(Property.agency_id == agency_id)

    if property_type:
        query = query.filter(Property.property_type == property_type)
    if transaction_type:
        query = query.filter(Property.transaction_type == transaction_type)
    if status:
        query = query.filter(Property.status == status)
    if city:
        query = query.filter(Property.city == city)
    if min_price:
        query = query.filter(Property.price >= min_price)
    if max_price:
        query = query.filter(Property.price <= max_price)
    if search:
        search_filter = or_(
            Property.title.ilike(f'%{search}%'),
            Property.reference.ilike(f'%{search}%'),
            Property.city.ilike(f'%{search}%'),
            Property.neighborhood.ilike(f'%{search}%')
        )
        query = query.filter(search_filter)

    # Sorting
    sort_by = request.args.get('sort_by', 'created_at')
    sort_order = request.args.get('sort_order', 'desc')
    if hasattr(Property, sort_by):
        order_column = getattr(Property, sort_by)
        if sort_order == 'desc':
            order_column = order_column.desc()
        query = query.order_by(order_column)

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'properties': [p.to_dict(include_images=True) for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@backoffice_bp.route('/properties/<int:property_id>', methods=['GET'])
@require_auth
def get_property(property_id):
    """Get a single property with full details."""
    prop = Property.query.get_or_404(property_id)

    # Check agency access
    if g.agency_id and prop.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    return jsonify(prop.to_dict(include_images=True))


@backoffice_bp.route('/properties', methods=['POST'])
@require_auth
def create_property():
    """Create a new property."""
    data = request.get_json()

    # Generate reference
    from datetime import datetime
    count = Property.query.count() + 1
    reference = f"PROP-{datetime.utcnow().strftime('%Y%m')}-{count:04d}"

    prop = Property(
        reference=reference,
        title=data.get('title'),
        description=data.get('description'),
        property_type=data.get('property_type'),
        transaction_type=data.get('transaction_type'),
        price=data.get('price'),
        charges=data.get('charges'),
        surface=data.get('surface'),
        land_surface=data.get('land_surface'),
        rooms=data.get('rooms'),
        bedrooms=data.get('bedrooms'),
        bathrooms=data.get('bathrooms'),
        floor=data.get('floor'),
        total_floors=data.get('total_floors'),
        construction_year=data.get('construction_year'),
        features=data.get('features', []),
        energy_class=data.get('energy_class'),
        address=data.get('address'),
        city=data.get('city'),
        neighborhood=data.get('neighborhood'),
        postal_code=data.get('postal_code'),
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        status=data.get('status', 'draft'),
        owner_id=g.current_user.id if g.current_user else None,
        agency_id=g.agency_id
    )

    db.session.add(prop)
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='create',
        entity_type='property',
        entity_id=prop.id,
        new_values={'title': prop.title, 'reference': prop.reference},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(prop.to_dict()), 201


@backoffice_bp.route('/properties/<int:property_id>', methods=['PUT'])
@require_auth
def update_property(property_id):
    """Update a property."""
    prop = Property.query.get_or_404(property_id)

    if g.agency_id and prop.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()
    old_values = {'title': prop.title, 'status': prop.status}

    # Update fields
    for field in ['title', 'description', 'property_type', 'transaction_type',
                  'price', 'charges', 'surface', 'land_surface', 'rooms',
                  'bedrooms', 'bathrooms', 'floor', 'total_floors',
                  'construction_year', 'features', 'energy_class', 'address',
                  'city', 'neighborhood', 'postal_code', 'latitude', 'longitude',
                  'status', 'is_premium', 'is_urgent', 'is_featured']:
        if field in data:
            setattr(prop, field, data[field])

    prop.updated_at = datetime.utcnow()
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='update',
        entity_type='property',
        entity_id=prop.id,
        old_values=old_values,
        new_values={'title': prop.title, 'status': prop.status},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(prop.to_dict())


@backoffice_bp.route('/properties/<int:property_id>', methods=['DELETE'])
@require_auth
def delete_property(property_id):
    """Delete (archive) a property."""
    prop = Property.query.get_or_404(property_id)

    if g.agency_id and prop.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    # Soft delete - just archive
    prop.status = 'archived'
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='delete',
        entity_type='property',
        entity_id=prop.id,
        old_values={'title': prop.title},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({'message': 'Property archived'})


@backoffice_bp.route('/properties/<int:property_id>/publish', methods=['POST'])
@require_auth
def publish_property(property_id):
    """Publish a property."""
    prop = Property.query.get_or_404(property_id)

    if g.agency_id and prop.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    prop.status = 'active'
    prop.published_at = datetime.utcnow()
    db.session.commit()

    return jsonify(prop.to_dict())


@backoffice_bp.route('/properties/<int:property_id>/unpublish', methods=['POST'])
@require_auth
def unpublish_property(property_id):
    """Unpublish a property."""
    prop = Property.query.get_or_404(property_id)

    if g.agency_id and prop.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    prop.status = 'draft'
    db.session.commit()

    return jsonify(prop.to_dict())


@backoffice_bp.route('/properties/stats', methods=['GET'])
@require_auth
def get_property_stats():
    """Get property statistics."""
    agency_id = g.agency_id
    agency_filter = Property.agency_id == agency_id if agency_id else True

    from sqlalchemy import func

    # By type
    by_type = db.session.query(
        Property.property_type,
        func.count(Property.id)
    ).filter(agency_filter).group_by(Property.property_type).all()

    # By status
    by_status = db.session.query(
        Property.status,
        func.count(Property.id)
    ).filter(agency_filter).group_by(Property.status).all()

    # By city
    by_city = db.session.query(
        Property.city,
        func.count(Property.id)
    ).filter(agency_filter).group_by(Property.city).all()

    # Total value
    total_value = db.session.query(
        func.sum(Property.price)
    ).filter(agency_filter, Property.status == 'active').scalar() or 0

    return jsonify({
        'by_type': [{'type': r[0], 'count': r[1]} for r in by_type],
        'by_status': [{'status': r[0], 'count': r[1]} for r in by_status],
        'by_city': [{'city': r[0], 'count': r[1]} for r in by_city],
        'total_value': float(total_value)
    })


@backoffice_bp.route('/properties/cities', methods=['GET'])
@require_auth
def get_cities():
    """Get list of cities with properties."""
    agency_id = g.agency_id
    agency_filter = Property.agency_id == agency_id if agency_id else True

    cities = db.session.query(Property.city).filter(
        agency_filter,
        Property.city.isnot(None)
    ).distinct().all()

    return jsonify({
        'cities': [c[0] for c in cities if c[0]]
    })
