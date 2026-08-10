import uuid
import math
from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import or_, and_, func, cast
from app import db
from app.api.v1 import api_v1_bp
from app.models import Property, PropertyImage, User
from app.services.moderation import exclude_moderated_properties as _exclude_moderated


class SearchQuery(db.Model):
    """Model to store AI search queries for v2."""
    __tablename__ = 'search_queries'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    query_text = db.Column(db.Text, nullable=False)  # Natural language query
    parsed_filters = db.Column(db.JSON)  # AI-extracted filters (v2)
    results_count = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # For AI processing in v2
    ai_processed = db.Column(db.Boolean, default=False)
    ai_response = db.Column(db.JSON)  # AI interpretation results


def generate_reference():
    """Generate unique property reference."""
    return f"SEM-{uuid.uuid4().hex[:8].upper()}"


@api_v1_bp.route('/properties', methods=['GET'])
def list_properties():
    """List properties with filters and pagination."""
    # Pagination
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    per_page = min(per_page, 100)  # Max 100 per page

    # Base query - only active properties for public
    query = Property.query.filter(Property.status == 'active')
    query = _exclude_moderated(query)

    # === Basic Filters ===
    if request.args.get('transaction_type'):
        query = query.filter(Property.transaction_type == request.args.get('transaction_type'))

    if request.args.get('property_type'):
        # Support multiple property types (comma-separated)
        types = request.args.get('property_type').split(',')
        if len(types) > 1:
            query = query.filter(Property.property_type.in_(types))
        else:
            query = query.filter(Property.property_type == types[0])

    if request.args.get('city'):
        query = query.filter(Property.city.ilike(f"%{request.args.get('city')}%"))

    if request.args.get('neighborhood'):
        query = query.filter(Property.neighborhood.ilike(f"%{request.args.get('neighborhood')}%"))

    # === Price Filters ===
    if request.args.get('min_price'):
        query = query.filter(Property.price >= request.args.get('min_price', type=float))

    if request.args.get('max_price'):
        query = query.filter(Property.price <= request.args.get('max_price', type=float))

    # === Surface Filters ===
    if request.args.get('min_surface'):
        query = query.filter(Property.surface >= request.args.get('min_surface', type=float))

    if request.args.get('max_surface'):
        query = query.filter(Property.surface <= request.args.get('max_surface', type=float))

    if request.args.get('min_land_surface'):
        query = query.filter(Property.land_surface >= request.args.get('min_land_surface', type=float))

    if request.args.get('max_land_surface'):
        query = query.filter(Property.land_surface <= request.args.get('max_land_surface', type=float))

    # === Room Filters ===
    if request.args.get('min_rooms'):
        query = query.filter(Property.rooms >= request.args.get('min_rooms', type=int))

    if request.args.get('max_rooms'):
        query = query.filter(Property.rooms <= request.args.get('max_rooms', type=int))

    if request.args.get('min_bedrooms'):
        query = query.filter(Property.bedrooms >= request.args.get('min_bedrooms', type=int))

    if request.args.get('max_bedrooms'):
        query = query.filter(Property.bedrooms <= request.args.get('max_bedrooms', type=int))

    if request.args.get('min_bathrooms'):
        query = query.filter(Property.bathrooms >= request.args.get('min_bathrooms', type=int))

    # === Building Filters ===
    if request.args.get('min_floor'):
        query = query.filter(Property.floor >= request.args.get('min_floor', type=int))

    if request.args.get('max_floor'):
        query = query.filter(Property.floor <= request.args.get('max_floor', type=int))

    if request.args.get('ground_floor'):
        if request.args.get('ground_floor') == 'true':
            query = query.filter(Property.floor == 0)

    if request.args.get('last_floor'):
        if request.args.get('last_floor') == 'true':
            query = query.filter(Property.floor == Property.total_floors)

    if request.args.get('min_construction_year'):
        query = query.filter(Property.construction_year >= request.args.get('min_construction_year', type=int))

    if request.args.get('max_construction_year'):
        query = query.filter(Property.construction_year <= request.args.get('max_construction_year', type=int))

    # === Energy Filters ===
    if request.args.get('energy_class'):
        classes = request.args.get('energy_class').split(',')
        query = query.filter(Property.energy_class.in_(classes))

    # === Feature Filters (JSON array contains) ===
    if request.args.get('features'):
        features = request.args.get('features').split(',')
        for feature in features:
            # Use case-insensitive text search on JSON array
            # This handles both capitalized and lowercase feature values
            query = query.filter(
                func.lower(cast(Property.features, db.Text)).contains(feature.lower())
            )

    # === Agency/Owner Filters ===
    if request.args.get('agency_id'):
        query = query.filter(Property.agency_id == request.args.get('agency_id', type=int))

    if request.args.get('owner_type'):
        # 'agency' or 'particular'
        if request.args.get('owner_type') == 'agency':
            query = query.filter(Property.agency_id.isnot(None))
        elif request.args.get('owner_type') == 'particular':
            query = query.filter(Property.agency_id.is_(None))

    # === Special Filters ===
    if request.args.get('is_featured') == 'true':
        query = query.filter(Property.is_featured == True)

    if request.args.get('is_urgent') == 'true':
        query = query.filter(Property.is_urgent == True)

    if request.args.get('has_photos') == 'true':
        # Properties with at least one image
        query = query.filter(Property.images.any())

    # === Geo Filters ===
    if request.args.get('lat') and request.args.get('lng') and request.args.get('radius'):
        # Simple bounding box filter (for precise distance, use PostGIS).
        # Use Python math (lat/lng/radius are plain floats) — mixing them with
        # SQL func.cos() previously produced an invalid expression and 500s.
        try:
            lat = float(request.args.get('lat'))
            lng = float(request.args.get('lng'))
            radius_km = float(request.args.get('radius'))
        except (TypeError, ValueError):
            lat = lng = radius_km = None
        if lat is not None and lng is not None and radius_km:
            # Approximate: 1 degree of latitude ≈ 111 km
            lat_delta = radius_km / 111.0
            cos_lat = max(abs(math.cos(math.radians(lat))), 0.01)  # avoid /0 near poles
            lng_delta = radius_km / (111.0 * cos_lat)
            query = query.filter(
                and_(
                    Property.latitude.between(lat - lat_delta, lat + lat_delta),
                    Property.longitude.between(lng - lng_delta, lng + lng_delta)
                )
            )

    # === Text Search ===
    if request.args.get('q'):
        search_term = f"%{request.args.get('q')}%"
        query = query.filter(
            or_(
                Property.title.ilike(search_term),
                Property.description.ilike(search_term),
                Property.city.ilike(search_term),
                Property.neighborhood.ilike(search_term),
                Property.address.ilike(search_term)
            )
        )

    # === Sorting ===
    sort = request.args.get('sort', 'newest')
    if sort == 'newest':
        query = query.order_by(Property.published_at.desc())
    elif sort == 'oldest':
        query = query.order_by(Property.published_at.asc())
    elif sort == 'price_asc':
        query = query.order_by(Property.price.asc())
    elif sort == 'price_desc':
        query = query.order_by(Property.price.desc())
    elif sort == 'surface_asc':
        query = query.order_by(Property.surface.asc())
    elif sort == 'surface_desc':
        query = query.order_by(Property.surface.desc())
    elif sort == 'rooms_asc':
        query = query.order_by(Property.rooms.asc())
    elif sort == 'rooms_desc':
        query = query.order_by(Property.rooms.desc())

    # Featured/urgent first (secondary sort), puis id desc (départage déterministe / pagination stable)
    query = query.order_by(
        Property.is_featured.desc(),
        Property.is_urgent.desc(),
        Property.id.desc()
    )

    # Execute query
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'properties': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'per_page': per_page,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev
    })


@api_v1_bp.route('/properties/search', methods=['POST'])
@jwt_required(optional=True)
def advanced_search():
    """
    Advanced search endpoint with AI prompt support (v2).
    Accepts natural language queries that will be processed by AI in v2.
    """
    data = request.get_json()
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None

    # Natural language query (for AI processing in v2)
    ai_query = data.get('ai_query')

    # Standard filters (can be combined with AI query)
    filters = data.get('filters', {})

    # Save search query for analytics and AI training
    if ai_query:
        search_query = SearchQuery(
            user_id=current_user_id,
            query_text=ai_query,
            ai_processed=False  # Will be True in v2 when AI processes it
        )
        db.session.add(search_query)
        db.session.commit()

        # V2: AI will parse this query and extract structured filters
        # For now, we do basic keyword extraction
        ai_response = {
            'status': 'v2_pending',
            'message': 'AI search sera disponible dans la v2',
            'original_query': ai_query,
            'tip': 'Pour l\'instant, utilisez les filtres avancés ci-dessous'
        }
    else:
        ai_response = None

    # Build query with provided filters
    query = Property.query.filter(Property.status == 'active')
    query = _exclude_moderated(query)

    # Apply standard filters from POST body
    if filters.get('transaction_type'):
        query = query.filter(Property.transaction_type == filters['transaction_type'])

    if filters.get('property_types'):
        query = query.filter(Property.property_type.in_(filters['property_types']))

    if filters.get('cities'):
        city_filters = [Property.city.ilike(f"%{city}%") for city in filters['cities']]
        query = query.filter(or_(*city_filters))

    if filters.get('neighborhoods'):
        neighborhood_filters = [Property.neighborhood.ilike(f"%{n}%") for n in filters['neighborhoods']]
        query = query.filter(or_(*neighborhood_filters))

    if filters.get('price_range'):
        if filters['price_range'].get('min'):
            query = query.filter(Property.price >= filters['price_range']['min'])
        if filters['price_range'].get('max'):
            query = query.filter(Property.price <= filters['price_range']['max'])

    if filters.get('surface_range'):
        if filters['surface_range'].get('min'):
            query = query.filter(Property.surface >= filters['surface_range']['min'])
        if filters['surface_range'].get('max'):
            query = query.filter(Property.surface <= filters['surface_range']['max'])

    if filters.get('rooms_range'):
        if filters['rooms_range'].get('min'):
            query = query.filter(Property.rooms >= filters['rooms_range']['min'])
        if filters['rooms_range'].get('max'):
            query = query.filter(Property.rooms <= filters['rooms_range']['max'])

    if filters.get('bedrooms_range'):
        if filters['bedrooms_range'].get('min'):
            query = query.filter(Property.bedrooms >= filters['bedrooms_range']['min'])
        if filters['bedrooms_range'].get('max'):
            query = query.filter(Property.bedrooms <= filters['bedrooms_range']['max'])

    if filters.get('required_features'):
        for feature in filters['required_features']:
            query = query.filter(
                func.lower(cast(Property.features, db.Text)).contains(feature.lower())
            )

    if filters.get('energy_classes'):
        query = query.filter(Property.energy_class.in_(filters['energy_classes']))

    if filters.get('construction_year_range'):
        if filters['construction_year_range'].get('min'):
            query = query.filter(Property.construction_year >= filters['construction_year_range']['min'])
        if filters['construction_year_range'].get('max'):
            query = query.filter(Property.construction_year <= filters['construction_year_range']['max'])

    if filters.get('floor_preferences'):
        prefs = filters['floor_preferences']
        if prefs.get('ground_floor_only'):
            query = query.filter(Property.floor == 0)
        elif prefs.get('high_floor'):
            query = query.filter(Property.floor >= 3)
        if prefs.get('with_elevator'):
            query = query.filter(
                func.lower(cast(Property.features, db.Text)).contains('ascenseur')
            )

    if filters.get('owner_type'):
        if filters['owner_type'] == 'agency':
            query = query.filter(Property.agency_id.isnot(None))
        elif filters['owner_type'] == 'particular':
            query = query.filter(Property.agency_id.is_(None))

    # Geo search
    if filters.get('geo'):
        geo = filters['geo']
        if geo.get('center') and geo.get('radius_km'):
            lat = geo['center']['lat']
            lng = geo['center']['lng']
            radius_km = geo['radius_km']
            lat_delta = radius_km / 111.0
            lng_delta = radius_km / 85.0  # Approximate for Morocco latitude
            query = query.filter(
                and_(
                    Property.latitude.between(lat - lat_delta, lat + lat_delta),
                    Property.longitude.between(lng - lng_delta, lng + lng_delta)
                )
            )

    # Sorting
    sort = filters.get('sort', 'relevance')
    if sort == 'relevance':
        query = query.order_by(Property.is_featured.desc(), Property.published_at.desc())
    elif sort == 'newest':
        query = query.order_by(Property.published_at.desc())
    elif sort == 'price_asc':
        query = query.order_by(Property.price.asc())
    elif sort == 'price_desc':
        query = query.order_by(Property.price.desc())

    # id desc en départage déterministe (pagination stable / parité search)
    query = query.order_by(Property.id.desc())

    # Pagination
    page = data.get('page', 1)
    per_page = min(data.get('per_page', 20), 100)

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    # Update search query with results count
    if ai_query:
        search_query.results_count = pagination.total
        db.session.commit()

    return jsonify({
        'properties': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'per_page': per_page,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev,
        'ai_response': ai_response,
        'available_filters': {
            'property_types': ['apartment', 'house', 'villa', 'riad', 'land', 'commercial', 'office', 'garage'],
            'features': [
                'parking', 'garage', 'jardin', 'terrasse', 'balcon', 'piscine',
                'ascenseur', 'gardien', 'climatisation', 'chauffage', 'meublé',
                'cuisine équipée', 'cave', 'vue mer', 'vue montagne', 'duplex'
            ],
            'energy_classes': ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
            'sort_options': ['relevance', 'newest', 'price_asc', 'price_desc', 'surface_asc', 'surface_desc']
        }
    })


@api_v1_bp.route('/properties/suggestions', methods=['GET'])
def get_search_suggestions():
    """Get search suggestions based on existing data."""
    query_term = request.args.get('q', '')

    if len(query_term) < 2:
        return jsonify({'suggestions': []})

    suggestions = []

    # City suggestions
    cities = db.session.query(Property.city).filter(
        Property.city.ilike(f"%{query_term}%"),
        Property.status == 'active'
    ).distinct().limit(5).all()
    suggestions.extend([{'type': 'city', 'value': c[0]} for c in cities if c[0]])

    # Neighborhood suggestions
    neighborhoods = db.session.query(Property.neighborhood).filter(
        Property.neighborhood.ilike(f"%{query_term}%"),
        Property.status == 'active'
    ).distinct().limit(5).all()
    suggestions.extend([{'type': 'neighborhood', 'value': n[0]} for n in neighborhoods if n[0]])

    return jsonify({'suggestions': suggestions[:10]})


@api_v1_bp.route('/properties/<int:property_id>', methods=['GET'])
def get_property(property_id):
    """Get a single property by ID."""
    property = Property.query.get_or_404(property_id)

    # Hide listings from moderated owners/agencies from the public (spec §6).
    # This route has no auth requirement (purely public detail view), so a
    # blanket 404 is safe here — it never masks an authenticated owner's own view.
    from app.models import User as _User, Agency as _Agency
    owner = _User.query.get(property.owner_id)
    if owner is None or owner.is_suspended or owner.deleted_at is not None:
        return jsonify({'error': 'Not found'}), 404
    if property.agency_id:
        ag = _Agency.query.get(property.agency_id)
        if ag is not None and (ag.is_suspended or ag.deleted_at is not None):
            return jsonify({'error': 'Not found'}), 404

    # Increment view count
    property.views_count += 1
    db.session.commit()

    return jsonify({'property': property.to_dict(include_images=True)})


@api_v1_bp.route('/properties', methods=['POST'])
@jwt_required()
def create_property():
    """Create a new property listing."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()

    # Validate required fields
    required = ['title', 'property_type', 'transaction_type', 'price', 'city']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    # Create property
    property = Property(
        reference=generate_reference(),
        title=data['title'],
        description=data.get('description'),
        property_type=data['property_type'],
        transaction_type=data['transaction_type'],
        price=data['price'],
        price_per_sqm=data.get('price_per_sqm'),
        charges=data.get('charges'),
        is_condo=(data.get('is_condo', True) and data.get('property_type') != 'land'),
        condo_fees=(None if data.get('property_type') == 'land' else data.get('condo_fees')),
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
        ges_class=data.get('ges_class'),
        address=data.get('address'),
        city=data['city'],
        neighborhood=data.get('neighborhood'),
        postal_code=data.get('postal_code'),
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        owner_id=user.id,
        agency_id=user.agency_id,
        status='draft'
    )

    db.session.add(property)
    db.session.commit()

    return jsonify({
        'message': 'Property created successfully',
        'property': property.to_dict()
    }), 201


@api_v1_bp.route('/properties/<int:property_id>', methods=['PUT'])
@jwt_required()
def update_property(property_id):
    """Update a property listing."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    property = Property.query.get_or_404(property_id)

    # Check ownership
    if property.owner_id != current_user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()

    # Update fields
    updatable_fields = [
        'title', 'description', 'property_type', 'transaction_type',
        'price', 'price_per_sqm', 'charges', 'is_condo', 'condo_fees',
        'surface', 'land_surface',
        'rooms', 'bedrooms', 'bathrooms', 'floor', 'total_floors',
        'construction_year', 'features', 'energy_class', 'ges_class',
        'address', 'city', 'neighborhood', 'postal_code',
        'latitude', 'longitude'
    ]

    for field in updatable_fields:
        if field in data:
            setattr(property, field, data[field])

    if property.property_type == 'land':
        property.is_condo = False
        property.condo_fees = None

    db.session.commit()

    return jsonify({
        'message': 'Property updated successfully',
        'property': property.to_dict()
    })


@api_v1_bp.route('/properties/<int:property_id>', methods=['DELETE'])
@jwt_required()
def delete_property(property_id):
    """Delete a property listing."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    property = Property.query.get_or_404(property_id)

    # Check ownership
    if property.owner_id != current_user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    db.session.delete(property)
    db.session.commit()

    return jsonify({'message': 'Property deleted successfully'})


@api_v1_bp.route('/properties/<int:property_id>/publish', methods=['POST'])
@jwt_required()
def publish_property(property_id):
    """Publish a property listing."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    property = Property.query.get_or_404(property_id)

    # Check ownership
    if property.owner_id != current_user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    property.status = 'active'
    property.published_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'message': 'Property published successfully',
        'property': property.to_dict()
    })


@api_v1_bp.route('/my-properties', methods=['GET'])
@jwt_required()
def my_properties():
    """Get current user's properties."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = Property.query.filter(Property.owner_id == current_user_id)

    # Filter by status
    if request.args.get('status'):
        query = query.filter(Property.status == request.args.get('status'))

    # Filter by transaction type (vente / location longue durée)
    if request.args.get('transaction_type'):
        query = query.filter(Property.transaction_type == request.args.get('transaction_type'))

    query = query.order_by(Property.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'properties': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })
