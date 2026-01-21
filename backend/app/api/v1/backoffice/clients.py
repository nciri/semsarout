from flask import jsonify, request, g
from datetime import datetime
from sqlalchemy import or_, and_
from app import db
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Client, ClientInteraction, Lead, User, ActivityLog


@backoffice_bp.route('/clients', methods=['GET'])
@require_auth
def get_clients():
    """Get all clients with filtering and pagination."""
    agency_id = g.agency_id
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    # Filters
    client_type = request.args.get('type')
    status = request.args.get('status')
    assigned_to = request.args.get('assigned_to', type=int)
    search = request.args.get('q')
    source = request.args.get('source')
    rating = request.args.get('rating', type=int)

    query = Client.query
    if agency_id:
        query = query.filter(Client.agency_id == agency_id)

    if client_type:
        query = query.filter(Client.client_type == client_type)
    if status:
        query = query.filter(Client.status == status)
    if assigned_to:
        query = query.filter(Client.assigned_to_id == assigned_to)
    if source:
        query = query.filter(Client.source == source)
    if rating:
        query = query.filter(Client.rating == rating)
    if search:
        search_filter = or_(
            Client.first_name.ilike(f'%{search}%'),
            Client.last_name.ilike(f'%{search}%'),
            Client.email.ilike(f'%{search}%'),
            Client.phone.ilike(f'%{search}%')
        )
        query = query.filter(search_filter)

    # Sorting
    sort_by = request.args.get('sort_by', 'created_at')
    sort_order = request.args.get('sort_order', 'desc')
    if hasattr(Client, sort_by):
        order_column = getattr(Client, sort_by)
        if sort_order == 'desc':
            order_column = order_column.desc()
        query = query.order_by(order_column)

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'clients': [c.to_dict() for c in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@backoffice_bp.route('/clients/<int:client_id>', methods=['GET'])
@require_auth
def get_client(client_id):
    """Get a single client with full details."""
    client = Client.query.get_or_404(client_id)

    # Check agency access
    if g.agency_id and client.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    return jsonify(client.to_dict(include_interactions=True))


@backoffice_bp.route('/clients', methods=['POST'])
@require_auth
def create_client():
    """Create a new client."""
    data = request.get_json()

    client = Client(
        first_name=data.get('first_name'),
        last_name=data.get('last_name'),
        email=data.get('email'),
        phone=data.get('phone'),
        phone_secondary=data.get('phone_secondary'),
        whatsapp=data.get('whatsapp'),
        address=data.get('address'),
        city=data.get('city'),
        postal_code=data.get('postal_code'),
        client_type=data.get('client_type', 'buyer'),
        source=data.get('source', 'website'),
        source_detail=data.get('source_detail'),
        search_criteria=data.get('search_criteria', {}),
        budget_min=data.get('budget_min'),
        budget_max=data.get('budget_max'),
        notes=data.get('notes'),
        tags=data.get('tags', []),
        assigned_to_id=data.get('assigned_to_id') or (g.current_user.id if g.current_user else None),
        agency_id=g.agency_id,
        gdpr_consent=data.get('gdpr_consent', False),
        gdpr_consent_date=datetime.utcnow() if data.get('gdpr_consent') else None,
        marketing_consent=data.get('marketing_consent', False)
    )

    db.session.add(client)
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='create',
        entity_type='client',
        entity_id=client.id,
        new_values={'name': client.full_name, 'type': client.client_type},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(client.to_dict()), 201


@backoffice_bp.route('/clients/<int:client_id>', methods=['PUT'])
@require_auth
def update_client(client_id):
    """Update a client."""
    client = Client.query.get_or_404(client_id)

    if g.agency_id and client.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()
    old_values = {'name': client.full_name, 'status': client.status}

    # Update fields
    for field in ['first_name', 'last_name', 'email', 'phone', 'phone_secondary',
                  'whatsapp', 'address', 'city', 'postal_code', 'client_type',
                  'status', 'source', 'source_detail', 'search_criteria',
                  'budget_min', 'budget_max', 'notes', 'next_follow_up',
                  'rating', 'tags', 'assigned_to_id']:
        if field in data:
            if field == 'next_follow_up' and data[field]:
                setattr(client, field, datetime.fromisoformat(data[field].replace('Z', '+00:00')))
            else:
                setattr(client, field, data[field])

    client.updated_at = datetime.utcnow()
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='update',
        entity_type='client',
        entity_id=client.id,
        old_values=old_values,
        new_values={'name': client.full_name, 'status': client.status},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(client.to_dict())


@backoffice_bp.route('/clients/<int:client_id>', methods=['DELETE'])
@require_auth
def delete_client(client_id):
    """Delete (archive) a client."""
    client = Client.query.get_or_404(client_id)

    if g.agency_id and client.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    # Soft delete - just archive
    client.status = 'archived'
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='delete',
        entity_type='client',
        entity_id=client.id,
        old_values={'name': client.full_name},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({'message': 'Client archived'})


@backoffice_bp.route('/clients/<int:client_id>/interactions', methods=['GET'])
@require_auth
def get_client_interactions(client_id):
    """Get all interactions for a client."""
    client = Client.query.get_or_404(client_id)

    if g.agency_id and client.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    pagination = client.interactions.order_by(
        ClientInteraction.created_at.desc()
    ).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'interactions': [i.to_dict() for i in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages
    })


@backoffice_bp.route('/clients/<int:client_id>/interactions', methods=['POST'])
@require_auth
def create_interaction(client_id):
    """Create a new interaction for a client."""
    client = Client.query.get_or_404(client_id)

    if g.agency_id and client.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()

    interaction = ClientInteraction(
        client_id=client_id,
        interaction_type=data.get('interaction_type'),
        direction=data.get('direction'),
        subject=data.get('subject'),
        content=data.get('content'),
        duration=data.get('duration'),
        property_id=data.get('property_id'),
        created_by_id=g.current_user.id if g.current_user else None
    )

    db.session.add(interaction)

    # Update last contact date
    client.last_contact_at = datetime.utcnow()
    db.session.commit()

    return jsonify(interaction.to_dict()), 201


@backoffice_bp.route('/clients/convert-lead/<int:lead_id>', methods=['POST'])
@require_auth
def convert_lead_to_client(lead_id):
    """Convert a lead to a client."""
    lead = Lead.query.get_or_404(lead_id)

    if g.agency_id and lead.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json() or {}

    # Parse name
    name_parts = lead.name.split(' ', 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ''

    client = Client(
        first_name=data.get('first_name', first_name),
        last_name=data.get('last_name', last_name),
        email=lead.email,
        phone=lead.phone,
        client_type=data.get('client_type', 'buyer'),
        source=lead.source,
        notes=lead.message,
        assigned_to_id=data.get('assigned_to_id') or (g.current_user.id if g.current_user else None),
        agency_id=g.agency_id,
        lead_id=lead.id
    )

    db.session.add(client)

    # Update lead status
    lead.status = 'converted'
    lead.converted_at = datetime.utcnow()

    db.session.commit()

    return jsonify(client.to_dict()), 201


@backoffice_bp.route('/clients/stats', methods=['GET'])
@require_auth
def get_client_stats():
    """Get client statistics."""
    agency_id = g.agency_id
    agency_filter = Client.agency_id == agency_id if agency_id else True

    from sqlalchemy import func

    # By type
    by_type = db.session.query(
        Client.client_type,
        func.count(Client.id)
    ).filter(agency_filter, Client.status == 'active').group_by(Client.client_type).all()

    # By source
    by_source = db.session.query(
        Client.source,
        func.count(Client.id)
    ).filter(agency_filter).group_by(Client.source).all()

    # By rating
    by_rating = db.session.query(
        Client.rating,
        func.count(Client.id)
    ).filter(agency_filter, Client.status == 'active').group_by(Client.rating).all()

    return jsonify({
        'by_type': [{'type': r[0], 'count': r[1]} for r in by_type],
        'by_source': [{'source': r[0], 'count': r[1]} for r in by_source],
        'by_rating': [{'rating': r[0], 'count': r[1]} for r in by_rating]
    })
